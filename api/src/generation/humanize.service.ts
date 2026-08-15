import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ArticlesService } from '../articles/articles.service';
import { GroundingService } from '../research/grounding.service';
import { DeepSeekService } from './deepseek.service';
import { PromptsService } from './prompts.service';
import { StageError } from './errors';
import { finaliseBody } from './post-process';
import type { ArticleFrontmatter } from '../seo/article.types';

export interface HumanizeResult {
  slug: string;
  charsBefore: number;
  charsAfter: number;
  emDashesRemoved: number;
  emDashesRemaining: number;
  score: number;
  max: number;
  /** False when the brief had no stored text, so nothing could be verified. */
  groundingChecked: boolean;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * Rewrite an article so it does not read as machine-generated, and prove the
 * rewrite did not move a fact.
 *
 * Shared by the pipeline's humanize stage and by `npm run humanize`, because a
 * backfilled article and a freshly generated one have to come out the same. Two
 * implementations of a prose rewrite that also has to preserve identifiers would
 * diverge on the first bug fixed in one of them.
 */
@Injectable()
export class HumanizeService {
  private readonly logger = new Logger(HumanizeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly articles: ArticlesService,
    private readonly grounding: GroundingService,
    private readonly deepseek: DeepSeekService,
    private readonly prompts: PromptsService,
  ) {}

  /** True when the article's brief carries text the grounding gate can check. */
  async canVerify(slug: string): Promise<boolean> {
    const article = await this.prisma.article.findUnique({
      where: { slug },
      select: { briefId: true },
    });
    if (!article?.briefId) return false;

    const withText = await this.prisma.researchSource.count({
      where: { briefId: article.briefId, NOT: { rawContent: '' } },
    });
    return withText > 0;
  }

  async humanize(slug: string): Promise<HumanizeResult> {
    const article = await this.prisma.article.findUnique({ where: { slug } });
    if (!article) {
      throw new StageError(
        `Article ${slug} is missing.`,
        'validation',
        'That article could not be found.',
      );
    }

    const frontmatter: Partial<ArticleFrontmatter> = {
      title: article.title,
      description: article.description,
      cves: article.cves,
    };

    const before = article.briefId
      ? await this.grounding.check(article.briefId, frontmatter, article.body)
      : null;

    const { value, usage } = await this.deepseek.text(
      [
        this.prompts.doc('humanizer'),
        '',
        '=== CALIBRATION — OVERRIDES EVERYTHING ABOVE IT ===',
        this.prompts.doc('humanize-calibration'),
        '',
        '=== MODE ===',
        'Embedded. Output the rewritten markdown body and nothing else. No',
        'preamble, no audit bullets, no summary, no code fence around it. The',
        'caller parses your entire response as the article body.',
      ].join('\n'),
      article.body,
      // An editing pass, not a writing one. Latitude here shows up as invented
      // detail rather than better prose.
      { temperature: 0.2, maxTokens: 8_000 },
    );

    const rewritten = finaliseBody(stripFence(value).trim(), {
      primaryKeyword: article.primaryKeyword,
      sources: (article.sources ?? []) as never,
    });

    if (rewritten.length < article.body.length * 0.75) {
      throw new StageError(
        `Rewrite returned ${rewritten.length} chars against an original of ${article.body.length}.`,
        'validation',
        'The editing step cut more than a quarter of the article, which means it summarised rather than edited. Nothing was saved. Try again.',
      );
    }

    // The safety net: anything that traced to a source before must still trace.
    if (before && article.briefId) {
      const after = await this.grounding.check(
        article.briefId,
        frontmatter,
        rewritten,
      );

      const lost = [
        ...before.groundedCves
          .map((g) => g.cve)
          .filter((cve) => after.unsourcedCves.includes(cve)),
        ...before.groundedIndicators
          .map((g) => g.indicator)
          .filter((i) => after.unsourcedIndicators.includes(i)),
      ];

      if (lost.length) {
        throw new StageError(
          `Rewrite broke grounding for: ${lost.join(', ')}`,
          'validation',
          `The edit altered ${lost.join(', ')}, which no longer matches the sources. ` +
            'Nothing was saved. Try again — this usually succeeds on a second attempt.',
        );
      }
    }

    const saved = await this.articles.patch(slug, { body: rewritten });

    const emBefore = countEmDashes(article.body);
    const emAfter = countEmDashes(rewritten);

    this.logger.log(
      `humanize ${slug}: ${article.body.length} -> ${rewritten.length} chars, ` +
        `em dashes ${emBefore} -> ${emAfter}, SEO ${saved.seo.score}/${saved.seo.max}`,
    );

    return {
      slug,
      charsBefore: article.body.length,
      charsAfter: rewritten.length,
      emDashesRemoved: emBefore - emAfter,
      emDashesRemaining: emAfter,
      score: saved.seo.score,
      max: saved.seo.max,
      groundingChecked: Boolean(before && (before.groundedCves.length || before.groundedIndicators.length)),
      usage,
    };
  }
}

function countEmDashes(text: string): number {
  return (text.match(/[—–]/g) ?? []).length;
}

/** Models fence prose about a third of the time despite being told not to. */
function stripFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return fenced ? fenced[1] : trimmed;
}
