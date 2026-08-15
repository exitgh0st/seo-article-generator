import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Stage, StageContext, StageResult } from '../stage.types';

/**
 * Does nothing, on purpose.
 *
 * It exists so the timeline has somewhere to show "waiting for you" as a real
 * step rather than as the absence of one. A run whose last row is a green "checks
 * passed" reads as finished, and the operator has no reason to believe anything
 * is expected of them.
 *
 * Publishing is deliberately not a stage. It is outward-facing and hard to
 * reverse, so it stays a person pressing a button on a screen showing what is
 * about to go live — never something a background worker does three minutes after
 * a topic was typed in.
 */
@Injectable()
export class ReviewStage implements Stage {
  readonly name = 'review' as const;

  constructor(private readonly prisma: PrismaService) {}

  async run(ctx: StageContext): Promise<StageResult> {
    const slug = ctx.run.articleSlug;
    const article = slug
      ? await this.prisma.article.findUnique({
          where: { slug },
          select: { slug: true, title: true, seoScore: true, seoMax: true, wordCount: true },
        })
      : null;

    return {
      output: {
        awaitingReview: true,
        slug: article?.slug ?? null,
        title: article?.title ?? null,
        score: article?.seoScore ?? null,
        max: article?.seoMax ?? null,
        wordCount: article?.wordCount ?? null,
      },
    };
  }
}
