import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Appends links to genuinely related articles, topping up to the rubric's range.
 *
 * Related is decided by shared tags, not by asking the model, which has no way to
 * know what else exists. Two relevant links beat four contrived ones, so this
 * stops at the minimum and adds nothing when nothing matches.
 *
 * Two things were wrong with the original, which lived inline in draft.stage.ts:
 *
 * 1. It only considered candidates at `review` or `published`. A corpus that is
 *    mostly drafts returned nothing, which is why every article this pipeline
 *    produced scored 0 internal links and lost row 10. Drafts are now eligible —
 *    the route resolves the moment the article exists, and the alternative is a
 *    cold-start problem no amount of prompting can fix.
 *
 * 2. It ran once, at the end of the draft stage. When row 10 failed there was no
 *    way to repair it, so the audit loop burned all three passes asking a model
 *    to fix something no prose edit could reach. The audit stage now calls this
 *    directly.
 *
 * Idempotent: a slug already linked from the body is never linked again, so
 * running this on every audit pass cannot stack duplicates.
 */
@Injectable()
export class InternalLinksService {
  /** Rubric row 10 passes at 2 to 4; aim for the floor. */
  private static readonly TARGET = 2;
  private static readonly MAX = 4;

  constructor(private readonly prisma: PrismaService) {}

  async topUp(body: string, slug: string): Promise<string> {
    const existing = countInternalLinks(body);
    if (existing >= InternalLinksService.TARGET) return body;

    const want = Math.min(
      InternalLinksService.TARGET - existing,
      InternalLinksService.MAX - existing,
    );
    if (want <= 0) return body;

    const candidates = await this.prisma.article.findMany({
      where: {
        slug: { not: slug },
        status: { in: ['draft', 'review', 'published'] },
      },
      select: { slug: true, title: true, tags: true, category: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    if (!candidates.length) return body;

    const bodyLower = body.toLowerCase();
    const scored = candidates
      .filter((c) => !bodyLower.includes(`/article/${c.slug.toLowerCase()}`))
      .map((c) => ({
        ...c,
        score: c.tags.filter((t) => bodyLower.includes(t.toLowerCase())).length,
      }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, want);

    if (!scored.length) return body;

    const links = scored
      .map((c) => `- [${c.title}](/article/${c.slug})`)
      .join('\n');

    // Reuse an existing Related section rather than opening a second one.
    if (/^## Related\s*$/m.test(body)) {
      return `${body.trimEnd()}\n${links}\n`;
    }

    return `${body.trimEnd()}\n\n## Related\n\n${links}\n`;
  }
}

/**
 * Matches the scorer's definition in seo-score.ts: an href under `/article/`
 * (singular — `/articles/` is a 404 the rubric will not count) or ending `.md`.
 */
export function countInternalLinks(body: string): number {
  const re = /(?<!!)\[[^\]]*\]\(([^)\s]+)/g;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(body)) !== null) {
    const href = m[1];
    if (/^https?:\/\//i.test(href)) continue;
    if (href.startsWith('/article/') || href.endsWith('.md')) n++;
  }
  return n;
}
