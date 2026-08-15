import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { today } from '../seo/article-validation.service';
import type { SaveBriefDto } from './dto/save-brief.dto';

export interface BriefSummary {
  id: string;
  slug: string;
  topic: string;
  researchedAt: string;
  status: string;
  sourceCount: number;
  /** Source counts by tier, so the operator can see at a glance if it is all Tier 3. */
  tierCounts: Record<number, number>;
  articleCount: number;
  createdAt: Date;
}

export interface BriefDetail extends BriefSummary {
  markdown: string;
  sources: {
    id: string;
    url: string;
    title: string;
    publisher: string;
    tier: number;
    accessedAt: string;
    /** Length of the retained page text. The text itself is not returned by default. */
    contentLength: number;
  }[];
}

@Injectable()
export class ResearchService {
  private readonly logger = new Logger(ResearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<BriefSummary[]> {
    const rows = await this.prisma.researchBrief.findMany({
      orderBy: { researchedAt: 'desc' },
      include: {
        sources: { select: { tier: true } },
        _count: { select: { articles: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      topic: row.topic,
      researchedAt: row.researchedAt,
      status: row.status,
      sourceCount: row.sources.length,
      tierCounts: countTiers(row.sources),
      articleCount: row._count.articles,
      createdAt: row.createdAt,
    }));
  }

  async findBySlug(slug: string): Promise<BriefDetail> {
    const row = await this.prisma.researchBrief.findUnique({
      where: { slug },
      include: {
        sources: { orderBy: [{ tier: 'asc' }, { createdAt: 'asc' }] },
        _count: { select: { articles: true } },
      },
    });

    if (!row) throw new NotFoundException(`No research brief with slug "${slug}"`);

    return {
      id: row.id,
      slug: row.slug,
      topic: row.topic,
      researchedAt: row.researchedAt,
      status: row.status,
      markdown: row.markdown,
      sourceCount: row.sources.length,
      tierCounts: countTiers(row.sources),
      articleCount: row._count.articles,
      createdAt: row.createdAt,
      sources: row.sources.map((s) => ({
        id: s.id,
        url: s.url,
        title: s.title,
        publisher: s.publisher,
        tier: s.tier,
        accessedAt: s.accessedAt,
        contentLength: s.rawContent.length,
      })),
    };
  }

  async requireId(id: string) {
    const row = await this.prisma.researchBrief.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`No research brief with id "${id}"`);
    return row;
  }

  /**
   * Creates or replaces a brief and its stored sources.
   *
   * docs/sources.md: a brief carried only by Tier 3 aggregators is not a brief.
   * The research skill is told to say so and stop; here it is enforced.
   */
  async save(dto: SaveBriefDto): Promise<BriefDetail> {
    const tiers = new Set(dto.sources.map((s) => s.tier));
    if (tiers.size === 1 && tiers.has(3)) {
      throw new BadRequestException(
        'Every source is Tier 3. A brief with no primary or credible-outlet sourcing is not a brief — see docs/sources.md.',
      );
    }

    const duplicateUrls = findDuplicates(dto.sources.map((s) => s.url));
    if (duplicateUrls.length) {
      throw new BadRequestException(
        `Duplicate source URLs: ${duplicateUrls.join(', ')}. Three outlets rewriting the same report count as one source.`,
      );
    }

    const data = {
      topic: dto.topic,
      researchedAt: dto.researchedAt ?? today(),
      status: dto.status ?? 'ready',
      markdown: dto.markdown,
    };

    // Replace sources wholesale rather than merging: a re-run of research on the
    // same slug is a new fact set, and a stale source left behind would let a
    // later grounding check pass against a page that is no longer cited.
    await this.prisma.$transaction(async (tx) => {
      const brief = await tx.researchBrief.upsert({
        where: { slug: dto.slug },
        create: { slug: dto.slug, ...data },
        update: data,
      });

      await tx.researchSource.deleteMany({ where: { briefId: brief.id } });
      await tx.researchSource.createMany({
        data: dto.sources.map((s) => ({
          briefId: brief.id,
          url: s.url,
          title: s.title,
          publisher: s.publisher,
          tier: s.tier,
          accessedAt: s.accessedAt,
          rawContent: s.rawContent ?? '',
        })),
      });
    });

    this.logger.log(
      `Saved brief ${dto.slug} — ${dto.sources.length} source(s), tiers ${[...tiers].sort().join('/')}`,
    );

    return this.findBySlug(dto.slug);
  }

  async remove(slug: string): Promise<void> {
    await this.findBySlug(slug);
    await this.prisma.researchBrief.delete({ where: { slug } });
  }
}

function countTiers(sources: { tier: number }[]): Record<number, number> {
  return sources.reduce<Record<number, number>>((acc, s) => {
    acc[s.tier] = (acc[s.tier] ?? 0) + 1;
    return acc;
  }, {});
}

function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const v of values) {
    const key = v.replace(/\/+$/, '').toLowerCase();
    if (seen.has(key)) dupes.add(v);
    seen.add(key);
  }
  return [...dupes];
}
