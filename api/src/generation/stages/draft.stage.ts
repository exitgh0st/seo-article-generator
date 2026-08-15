import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { ResearchService } from '../../research/research.service';
import { ArticlesService } from '../../articles/articles.service';
import { DeepSeekService } from '../deepseek.service';
import { PromptsService, today } from '../prompts.service';
import { StageError } from '../errors';
import { InternalLinksService } from '../internal-links.service';
import { ARTICLE_CATEGORIES } from '../../seo/article.types';
import type { Stage, StageContext, StageResult } from '../stage.types';
import {
  finaliseBody,
  sanitiseSlug,
  clampDescription,
  stripBodyFence,
  normaliseKeyword,
  deriveSecondaryKeywords,
} from '../post-process';

/**
 * Write the article from the brief and the chosen angle.
 *
 * Two things the model is deliberately not trusted with, both because it got
 * them wrong in every measured article:
 *
 * **Internal links.** It wrote `/articles/<slug>` three times out of three. The
 * route is `/article/:slug`, so every one of those was a 404 that also failed the
 * rubric row. It is no longer asked for them — code appends them afterwards from
 * real rows.
 *
 * **The primary keyword.** Handed a suggested keyword it repeated the phrase
 * verbatim four times, producing "The TeamCity CVE-2026-63077 patch is not
 * optional" and similar. The keyword now comes from the operator's form or the
 * chosen angle, normalised here.
 */

const CATEGORY_VALUES = ARTICLE_CATEGORIES as readonly string[];

/**
 * Frontmatter only. The body is fetched separately, as plain markdown.
 *
 * Asking for both in one JSON object produced 607-word articles with no links:
 * every character of a 1,100-word body has to be escaped inside a JSON string,
 * and the model economises on exactly the things that cost the most to escape —
 * length, and markdown link syntax. Splitting the call fixed both, at the cost
 * of one extra request.
 */
const FrontmatterSchema = z.object({
  title: z.string().min(10).max(70),
  headline: z.string().min(10).max(120),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().min(120).max(200),
  secondaryKeywords: z.array(z.string().min(2)).min(3).max(5),
  category: z.enum(CATEGORY_VALUES as [string, ...string[]]),
  tags: z.array(z.string().min(2)).min(3).max(8),
  cves: z.array(z.string()).default([]),
});

@Injectable()
export class DraftStage implements Stage {
  readonly name = 'draft' as const;
  private readonly logger = new Logger(DraftStage.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly research: ResearchService,
    private readonly articles: ArticlesService,
    private readonly deepseek: DeepSeekService,
    private readonly prompts: PromptsService,
    private readonly internalLinks: InternalLinksService,
  ) {}

  async run(ctx: StageContext): Promise<StageResult> {
    const { briefSlug, chosenAngle, category, topic } = ctx.run;
    if (!briefSlug) {
      throw new StageError(
        'No brief on the run.',
        'validation',
        'The research step did not finish. Retry from there.',
      );
    }

    const angle = chosenAngle as {
      title: string;
      summary: string;
      primaryKeyword: string;
    } | null;

    if (!angle) {
      throw new StageError(
        'No angle chosen.',
        'validation',
        'Choose an angle before this step can run.',
      );
    }

    const brief = await this.research.findBySlug(briefSlug);
    const primaryKeyword = normaliseKeyword(
      ctx.run.primaryKeyword || angle.primaryKeyword,
    );

    const sourceList = brief.sources
      .map((s) => `- ${s.title} — ${s.publisher} (Tier ${s.tier}) — ${s.url}`)
      .join('\n');

    const context = [
      `Chosen angle: ${angle.title}`,
      `Who it serves: ${angle.summary}`,
      `Original topic as typed: ${topic}`,
      `Category hint from the operator: ${category}`,
      `Primary keyword (fixed): ${primaryKeyword}`,
      '',
      '--- RESEARCH BRIEF ---',
      brief.markdown,
      '',
      '--- SOURCES AVAILABLE TO LINK ---',
      sourceList,
    ].join('\n');

    const meta = await this.deepseek.json(
      FrontmatterSchema,
      [
        this.prompts.preamble(),
        '',
        '--- SEO RUBRIC ---',
        this.prompts.doc('seo-checklist'),
        '',
        '--- FRONTMATTER SCHEMA ---',
        this.prompts.doc('frontmatter-schema'),
        '',
        '--- YOUR TASK ---',
        'Produce the frontmatter for this article. Return JSON with exactly these',
        'keys: title, headline, slug, description, secondaryKeywords, category,',
        'tags, cves. Do not write the article body.',
        '',
        `The primary keyword is fixed: "${primaryKeyword}".`,
        'It must appear in the title within the first five words.',
        '',
        'title: 60 characters or fewer.',
        'description: between 150 and 160 characters INCLUSIVE, containing the',
        '  primary keyword, ending on a concrete reason to click. Count the',
        '  characters before you answer. This row blocks publication and it fails',
        '  on 143 exactly as hard as on 175 — too short is the more common miss,',
        '  because a natural summary runs about 120. Write the summary, then add a',
        '  specific detail (a version, a date, a deadline) until it reaches 150.',
        'slug: three to six lowercase hyphenated words, no stopwords, no dates and',
        '  no four-digit numbers.',
        'secondaryKeywords: three to five, each of which you can genuinely use in',
        '  the body. Do not propose one you will not use.',
        'cves: only identifiers that appear in the brief.',
        `category: one of ${CATEGORY_VALUES.join(', ')}.`,
      ].join('\n'),
      context,
      { maxTokens: 1_200 },
    );

    const body = await this.deepseek.text(
      [
        this.prompts.preamble(),
        '',
        '--- EDITORIAL STANDARDS ---',
        this.prompts.doc('editorial-standards'),
        '',
        '--- YOUR TASK ---',
        'Write the article body as markdown. Output only the markdown — no',
        'frontmatter, no JSON, no code fence around the whole thing, no preamble.',
        '',
        '**Length: 1000 to 1300 words.** This is a hard requirement and the most',
        'common failure. A 600-word draft is rejected. Write the full piece.',
        '',
        'The body starts at H2. Never write an H1 — the page heading is separate.',
        '',
        'Structure, in order:',
        '- Lede: the most newsworthy specific fact, in the first sentence.',
        '- Nut graf by the third paragraph: why this reader, today.',
        '- What happened: the timeline and the actors.',
        '- Technical detail, including one question-form H2 with a self-contained',
        '  40 to 60 word answer directly beneath it.',
        '- Who is affected: products, versions, exposure.',
        '- What to do now: the only section written in second person.',
        '- What is still unknown: forward-looking. Never a summary.',
        '',
        '**Vary sentence length, and prefer the shorter word.** Measured runs of',
        'this pipeline average 22 to 26 words per sentence with almost no',
        'variance, which fails the readability row and reads as machine-written.',
        'Aim for a 14 to 18 word average with real spread: a six-word sentence',
        'next to a thirty-word one. Where a plain word carries the same meaning,',
        'use it — "scaled up" over "industrialised", "firms" over "organisations",',
        '"plain" over "unglamorous". Never simplify a technical term, a product',
        'name, a hedge or an attribution; those stay exactly as they are.',
        '',
        '**Link out generously.** Use markdown links to the source URLs supplied.',
        'Link the first mention of each advisory, CVE record and research report.',
        'Four or more links is normal for a piece with this many sources; three is',
        'the floor. A claim with a linked primary source is the whole point.',
        '',
        `Use the primary keyword "${primaryKeyword}" once in the first 100 words,`,
        'in at least one H2, and four to eight times in total. Never force it.',
        '',
        'Use each of these secondary keywords at least once in the prose (not',
        `inside backticks): ${meta.value.secondaryKeywords.join(', ')}.`,
        '',
        'Do NOT write internal links to other articles on this site. They are',
        'appended afterwards, and one you invent would be a dead link.',
      ].join('\n'),
      context,
      { maxTokens: 8_000 },
    );

    // Everything below is repaired in code rather than asked for again. Each of
    // these was instructed explicitly in the prompt above and came back wrong:
    // the model wrote a slug containing the CVE year, a 175-character
    // description against a 160 ceiling, and no source links at all.
    const slug = sanitiseSlug(meta.value.slug, primaryKeyword);
    const description = clampDescription(meta.value.description);

    const finalised = finaliseBody(stripBodyFence(body.value), {
      primaryKeyword,
      sources: brief.sources as never,
    });
    const withLinks = await this.appendInternalLinks(finalised, slug);

    // Declared after the fact, from what the prose actually says.
    const secondaryKeywords = deriveSecondaryKeywords(
      withLinks,
      meta.value.secondaryKeywords,
      primaryKeyword,
    );

    const value = { ...meta.value, slug, description, secondaryKeywords };
    const usage = {
      inputTokens: meta.usage.inputTokens + body.usage.inputTokens,
      outputTokens: meta.usage.outputTokens + body.usage.outputTokens,
    };

    // Grounding is enforced here. The brief's sources carry real page text, so a
    // CVE the model invented is caught at the save rather than at publication.
    const saved = await this.articles.save(
      {
        title: value.title,
        headline: value.headline,
        slug: value.slug,
        description: value.description,
        primaryKeyword,
        secondaryKeywords: value.secondaryKeywords,
        category: value.category as never,
        tags: value.tags,
        author: { name: 'Jordan Ellis', title: 'Security Writer' },
        publishedAt: today(),
        updatedAt: today(),
        status: 'draft',
        cves: value.cves,
        sources: brief.sources.map((s) => ({
          title: s.title,
          url: s.url,
          publisher: s.publisher,
          tier: s.tier as 1 | 2 | 3,
          accessedAt: s.accessedAt,
        })),
        canonical: '',
        body: withLinks,
        briefId: brief.id,
      },
      { enforceGrounding: true },
    );

    this.logger.log(
      `draft ${saved.article.slug}: ${saved.seo.stats.wordCount}w, SEO ${saved.seo.score}/${saved.seo.max}`,
    );

    return {
      output: {
        slug: saved.article.slug,
        score: saved.seo.score,
        max: saved.seo.max,
        wordCount: saved.seo.stats.wordCount,
      },
      usage,
      runPatch: { articleSlug: saved.article.slug },
    };
  }

  /**
   * Append internal links to genuinely related articles.
   *
   * The implementation moved to InternalLinksService so the audit stage can call
   * it too — row 10 was failing with no way to repair it, because links were only
   * ever added here.
   */
  private appendInternalLinks(body: string, slug: string): Promise<string> {
    return this.internalLinks.topUp(body, slug);
  }
}
