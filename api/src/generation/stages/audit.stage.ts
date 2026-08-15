import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { ArticlesService } from '../../articles/articles.service';
import { DeepSeekService } from '../deepseek.service';
import { PromptsService } from '../prompts.service';
import { StageError, OutputValidationError } from '../errors';
import { PUBLISH_LIMITS } from '../../common/constants/limits';
import { finaliseBody, clampDescription } from '../post-process';
import { scanEditorial } from '../../seo/banned-terms';
import { GroundingService } from '../../research/grounding.service';
import { InternalLinksService } from '../internal-links.service';
import type { Stage, StageContext, StageResult } from '../stage.types';
import type { ArticleFrontmatter, SeoRow } from '../../seo/article.types';

/**
 * Score, fix, score again — up to three passes.
 *
 * The measured effect of a single pass is 11/15 to 14/15: the rows it catches are
 * mechanical ones a writing pass reliably misses, like a keyword that never made
 * it into an H2, or a declared secondary keyword never used.
 *
 * Three is the ceiling on purpose. A rubric that will not go green after three
 * targeted fixes is telling you the angle or the sourcing is wrong, and further
 * passes just make the prose worse while chasing a number.
 *
 * One row is allowed to stay unfixed: Images, because inventing a hero image path
 * to satisfy a row is exactly the dishonesty the rubric exists to prevent. Nothing
 * in either pipeline sets `heroImage`, so 14/15 is the working ceiling and an
 * article that reaches it is finished.
 *
 * Readability used to be tolerated here too, on the reasoning that a paragraph
 * explaining an exploit chain is correctly long. Measured against the articles the
 * Claude Code path produces on matched topics, that reasoning does not hold: those
 * run 14.4 to 17.7 words per sentence against this pipeline's 22.3 to 25.3, on the
 * same material. The row is winnable, so it is no longer excused — but see the fix
 * prompt, which asks for variance rather than a uniformly lower average, because
 * shortening every sentence equally is its own tell.
 */

const MAX_PASSES = 3;
const TOLERATED_ROWS = new Set(['Images']);

/**
 * `title` is here because row 1 is required, blocks publication, and was
 * unfixable without it: the loop could return a new body, headline and
 * description but never a title, so a run whose only defect was a 63-character
 * title burned three passes and failed. It is the page's `<title>` tag, distinct
 * from `headline`, which is the on-page H1.
 */
const FixSchema = z.object({
  body: z.string().min(600),
  title: z.string().min(10).max(60).optional(),
  headline: z.string().min(10).max(120).optional(),
  description: z.string().min(120).max(200).optional(),
});

@Injectable()
export class AuditStage implements Stage {
  readonly name = 'audit' as const;
  private readonly logger = new Logger(AuditStage.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly articles: ArticlesService,
    private readonly deepseek: DeepSeekService,
    private readonly prompts: PromptsService,
    private readonly grounding: GroundingService,
    private readonly internalLinks: InternalLinksService,
  ) {}

  async run(ctx: StageContext): Promise<StageResult> {
    const slug = ctx.run.articleSlug;
    if (!slug) {
      throw new StageError(
        'No article on the run.',
        'validation',
        'The writing step did not finish. Retry from there.',
      );
    }

    let inputTokens = 0;
    let outputTokens = 0;
    const passes: { pass: number; score: number; fixed: string[] }[] = [];

    for (let pass = 1; pass <= MAX_PASSES; pass++) {
      const scored = await this.articles.rescore(slug);
      const rows = scored.seo.rows as SeoRow[];
      const failing = rows.filter(
        (r) => r.status !== 'pass' && !TOLERATED_ROWS.has(r.name),
      );

      passes.push({
        pass,
        score: scored.seo.score,
        fixed: failing.map((r) => r.name),
      });

      // Stop when there is nothing left worth fixing, not when the article
      // scrapes past the publish floor.
      //
      // This used to accept at `score >= PUBLISH_LIMITS.minSeoScore` (12), which
      // is why every article this pipeline produced landed on exactly 12/15: the
      // loop declared victory the moment it cleared the gate and never attempted
      // the advisory rows. On matched topics the Claude Code path reached 14/15
      // on all five, failing only Images. The rows the old bar skipped were
      // winnable, so the bar now sits at the ceiling and exhaustion is handled
      // below rather than by stopping early.
      const acceptable = !failing.length;

      if (acceptable) {
        await this.articles.setStatus(slug, 'review');
        this.logger.log(`audit ${slug}: clean at ${scored.seo.score}/${scored.seo.max} after ${pass} pass(es)`);
        return {
          output: {
            score: scored.seo.score,
            max: scored.seo.max,
            passes,
            status: 'review',
          },
          usage: { inputTokens, outputTokens },
        };
      }

      if (pass === MAX_PASSES) break;

      const article = await this.prisma.article.findUniqueOrThrow({
        where: { slug },
      });

      // The ban list already runs on every save, inside ArticlesService.save(),
      // and its result was being thrown away here — only SEO rows drove the fix
      // prompt, so banned vocabulary survived every pass untouched. Feeding the
      // violations back is also the main guard against the higher acceptance bar
      // producing stilted prose: more rewriting passes mean more chances to
      // reach for "robust" and "seamless", and now those come straight back.
      //
      // Advisories are deliberately excluded. "critical" is legitimate for a
      // CVSS rating, and asking a model to remove it produces worse copy than
      // leaving it.
      const editorialHits = scanEditorial(article.body).hits.filter(
        (h) => h.severity === 'violation',
      );

      // What traced to a source before this pass must still trace after it.
      //
      // This loop rewrites the whole body up to three times through
      // `articles.patch()`, which does not pass `enforceGrounding`, so until now
      // three consecutive model rewrites ran with no fact check at all. The
      // humanize stage has always done this correctly; the audit stage simply
      // never did. Same before/after comparison, same reason.
      const frontmatter: Partial<ArticleFrontmatter> = {
        title: article.title,
        description: article.description,
        cves: article.cves,
      };
      const groundedBefore = article.briefId
        ? await this.grounding.check(article.briefId, frontmatter, article.body)
        : null;

      // A malformed fix response costs this pass, not the run.
      //
      // The call asks for a whole article body inside a JSON string field, which
      // is the same shape draft.stage.ts split into two calls after it produced
      // truncated articles: every character of a 1,300-word body has to be
      // escaped, and the longer the article the likelier the reply comes back
      // unparseable or missing `body`. Measured twice on a 1,362-word draft.
      //
      // The loop already tolerates a pass achieving nothing, so a schema failure
      // should behave like one rather than throwing away two remaining passes
      // and an article that may already be publishable.
      let fix: Awaited<ReturnType<AuditStage['fixCall']>>;
      try {
        fix = await this.fixCall(article, failing, editorialHits);
      } catch (error) {
        if (error instanceof OutputValidationError) {
          this.logger.warn(
            `audit ${slug}: fix pass ${pass} returned an unusable response, skipping`,
          );
          continue;
        }
        throw error;
      }
      const { value, usage } = fix;

      inputTokens += usage.inputTokens;
      outputTokens += usage.outputTokens;

      // Same reason as the humanize stage: a fix pass rewrites the whole body,
      // so the deterministic repairs go back on afterwards or the next score
      // measures a body that lost them.
      let fixedBody = finaliseBody(value.body, {
        primaryKeyword: article.primaryKeyword,
        sources: (article.sources ?? []) as never,
      });

      // Row 10 cannot be fixed by editing prose — the model has no way to know
      // which articles exist. Repair it in code, the same way source links are.
      if (failing.some((r) => r.name === 'Internal links')) {
        fixedBody = await this.internalLinks.topUp(fixedBody, slug);
      }

      if (groundedBefore && article.briefId) {
        const groundedAfter = await this.grounding.check(
          article.briefId,
          frontmatter,
          fixedBody,
        );

        const lost = [
          ...groundedBefore.groundedCves
            .map((g) => g.cve)
            .filter((cve) => groundedAfter.unsourcedCves.includes(cve)),
          ...groundedBefore.groundedIndicators
            .map((g) => g.indicator)
            .filter((i) => groundedAfter.unsourcedIndicators.includes(i)),
        ];

        if (lost.length) {
          throw new StageError(
            `Fix pass ${pass} broke grounding for: ${lost.join(', ')}`,
            'validation',
            `A fix pass altered ${lost.join(', ')}, which no longer matches the sources. ` +
              'That pass was discarded and nothing was saved. Retry the audit step.',
          );
        }
      }

      let description = value.description
        ? clampDescription(value.description)
        : undefined;

      // Row 3 is required, blocks publication, and is the most consistent
      // failure this pipeline has: measured runs produced 143 characters against
      // a 150–160 window, and folding the repair into an 8,000-token body
      // rewrite did not reliably fix it in three passes. clampDescription only
      // trims the too-long case, so a short one sails through untouched.
      //
      // A dedicated call costs a few hundred tokens and asks for one thing.
      const descriptionFailing = failing.some((r) => r.name === 'Meta description');
      if (descriptionFailing && !inRange(description ?? article.description)) {
        const repaired = await this.repairDescription(
          article.primaryKeyword,
          description ?? article.description,
        );
        if (repaired) description = repaired;
      }

      await this.articles.patch(slug, {
        body: fixedBody,
        ...(value.title ? { title: value.title } : {}),
        ...(value.headline ? { headline: value.headline } : {}),
        ...(description ? { description } : {}),
      });
    }

    // Out of passes. Raising the bar to "no failing rows" means falling through
    // to here is now normal rather than exceptional, so this no longer throws on
    // an article the publish gate would accept. Failing a clean 13/15 that the
    // preflight would have passed would be a regression introduced by trying to
    // reach 14.
    //
    // The distinction that matters is the publish gate's: no blocking row and a
    // score at or above the floor. Above it, finish at `review` and record what
    // stayed unfixed. Below it, the run failed and the operator needs to know.
    const final = await this.articles.rescore(slug);
    const stillFailing = (final.seo.rows as SeoRow[])
      .filter((r) => r.status !== 'pass' && !TOLERATED_ROWS.has(r.name))
      .map((r) => r.name);

    const publishable =
      !final.seo.blocking.length &&
      final.seo.score >= PUBLISH_LIMITS.minSeoScore;

    if (publishable) {
      await this.articles.setStatus(slug, 'review');
      this.logger.log(
        `audit ${slug}: ${final.seo.score}/${final.seo.max} after ${MAX_PASSES} pass(es), ` +
          `unfixed: ${stillFailing.join(', ') || 'none'}`,
      );
      return {
        output: {
          score: final.seo.score,
          max: final.seo.max,
          passes,
          status: 'review',
          unfixed: stillFailing,
        },
        usage: { inputTokens, outputTokens },
      };
    }

    throw new StageError(
      `Still failing after ${MAX_PASSES} passes: ${stillFailing.join(', ')}`,
      'validation',
      `The article reached ${final.seo.score} of ${final.seo.max} and could not be brought further automatically ` +
        `(${stillFailing.join(', ')}). The draft is saved and you can edit it directly, or start again with a different angle.`,
    );
  }

  /**
   * The fix call, isolated so the loop can treat a malformed reply as a wasted
   * pass rather than a failed stage.
   */
  private fixCall(
    article: { primaryKeyword: string; secondaryKeywords: string[]; title: string; headline: string | null; description: string; body: string },
    failing: SeoRow[],
    editorialHits: { line: number; term: string; note?: string }[],
  ) {
    return this.deepseek.json(
      FixSchema,
        [
          this.prompts.preamble(),
          '',
          '--- EDITORIAL STANDARDS ---',
          this.prompts.doc('editorial-standards'),
          '',
          '--- SEO RUBRIC ---',
          this.prompts.doc('seo-checklist'),
          '',
          '--- YOUR TASK ---',
          'Fix only the rows listed as failing. Return JSON with "body", and',
          '"title", "headline" or "description" only if those specifically need',
          'changing.',
          '',
          '"title" is the search-result title tag: 60 characters or fewer, with the',
          'primary keyword inside the first five words. "headline" is the on-page',
          'H1 and may be longer and more conversational. They are different fields',
          'and fixing one does not fix the other.',
          '',
          'Fix surgically. Change a word, a sentence, a heading. Do not rewrite',
          'sections that are not implicated, and do not touch a fact, a version',
          'number, a CVE identifier, an IP address or anything inside a quote.',
          '',
          'Never satisfy a row by inventing something. If a row cannot be fixed',
          'honestly, leave it and fix the others. Returning the body unchanged is a',
          'valid answer when no honest fix exists.',
          '',
          'Rows fail in both directions, and the detail line tells you which way:',
          '',
          '- Keyword density is a range, 4 to 8. Under it, find a place the keyword',
          '  genuinely belongs and do not staple it on. Over it, replace the surplus',
          '  with a pronoun or a shorter natural name for the same thing. Nine uses',
          '  of a product name reads as keyword stuffing, which is worse than seven.',
          '- Length is a range, 900 to 1400 words. Over it, cut repetition and',
          '  restatement, never a fact or an attribution.',
          '- Meta description must be between 150 and 160 characters inclusive.',
          '  Count them. Too short fails exactly as hard as too long, and this row',
          '  blocks publication.',
          '',
          'Preserve hedged attribution exactly — "likely", "reported", "assessed",',
          '"claimed" carry meaning and are not padding.',
          '',
          'If Readability is failing, read the detail line: it gives you both the',
          'average sentence length and the Flesch score, and they need different',
          'fixes.',
          '',
          'Average over 22 words means split sentences. The target is variance,',
          'not a uniformly lower average: split the ones over about 30 words and',
          'leave the short ones alone. A six-word sentence next to a thirty-word',
          'one reads as written by a person; a page of identical mid-length',
          'sentences does not.',
          '',
          'Flesch under 40 means the words are too long, not the sentences. Swap',
          'in the plain word wherever one carries the same meaning — "scaled up"',
          'for "industrialised", "firms" for "organisations", "plain" for',
          '"unglamorous", "login-checking files" for "authentication processing',
          'files". Never simplify a technical term, a product name, a CVE, a hedge',
          'or an attribution to buy the number.',
          '',
          'Never shorten by deleting a fact, a qualifier, a date stamp or an',
          'attribution — cut connective padding instead.',
          '',
          'If banned vocabulary is listed below, replace each term with the plain',
          'word you would have used anyway. Do not delete the sentence around it.',
        ].join('\n'),
        [
          'Rows failing:',
          ...failing.map((r) => `- ${r.n}. ${r.name}${r.required ? ' (REQUIRED — blocks publication)' : ''}: ${r.detail}`),
          ...(editorialHits.length
            ? [
                '',
                'Banned vocabulary and patterns found (docs/editorial-standards.md):',
                ...editorialHits.map((h) => `- line ${h.line}: ${h.term} — ${h.note}`),
              ]
            : []),
          '',
          `Primary keyword: "${article.primaryKeyword}"`,
          `Declared secondary keywords: ${article.secondaryKeywords.join(', ')}`,
          `Current title (${article.title.length} chars): ${article.title}`,
          `Current headline: ${article.headline ?? article.title}`,
          `Current description (${article.description.length} chars): ${article.description}`,
          '',
          '--- BODY ---',
          article.body,
        ].join('\n'),
        { temperature: 0.2, maxTokens: 8_000 },
      );
  }

  /**
   * One small call for one mechanical field. Returns undefined rather than
   * throwing: a failed description repair should not take the run down when the
   * next pass may fix it anyway.
   */
  private async repairDescription(
    primaryKeyword: string,
    current: string,
  ): Promise<string | undefined> {
    try {
      const { value } = await this.deepseek.json(
        z.object({ description: z.string() }),
        [
          'You rewrite a single meta description to an exact length.',
          '',
          'Return JSON: { "description": "..." }',
          '',
          'Rules:',
          `- Between ${DESC_MIN} and ${DESC_MAX} characters inclusive. Count them.`,
          `- Must contain the phrase "${primaryKeyword}".`,
          '- Keep every fact in the original. Do not add one that is not there.',
          '- If it is too short, add a specific detail already implied by it (a',
          '  version, a date, a deadline). If too long, cut adjectives first.',
        ].join('\n'),
        `Current (${current.length} characters): ${current}`,
        { temperature: 0.2, maxTokens: 400 },
      );

      const next = value.description.trim();
      return inRange(next) ? next : undefined;
    } catch {
      return undefined;
    }
  }
}

const DESC_MIN = 150;
const DESC_MAX = 160;

function inRange(text: string): boolean {
  return text.length >= DESC_MIN && text.length <= DESC_MAX;
}
