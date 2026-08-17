import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import type { Article as ArticleRow, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { articleExportPath } from '../publish/markdown-export';
import { MarkdownService } from '../seo/markdown.service';
import {
  ArticleValidationService,
  today,
} from '../seo/article-validation.service';
import { scanEditorial, type EditorialScanResult } from '../seo/banned-terms';
import { scoreArticle } from '../seo/seo-score';
import type {
  ArticleFrontmatter,
  ArticleStatus,
  SeoResult,
  Source,
} from '../seo/article.types';
import { GroundingService, type GroundingReport } from '../research/grounding.service';
import { toFull, toMeta, type ArticleMetaResponse, type ArticleResponse } from './article.mapper';
import type { SaveArticleDto } from './dto/save-article.dto';
import type { ListArticlesDto } from './dto/list-articles.dto';
import type { PatchArticleDto } from './dto/patch-article.dto';
import type { Env } from '../config/env.schema';

const WORDS_PER_MINUTE = 225;

export interface SaveOptions {
  /**
   * Reject CVE IDs that do not appear in the raw text of a source attached to the
   * article's brief. On when the draft stage writes an article, off when a
   * person edits one through the admin UI — someone correcting a typo should not
   * be blocked by a check whose whole purpose is to catch model invention.
   */
  enforceGrounding?: boolean;
}

export interface SaveResult {
  article: ArticleResponse;
  seo: SeoResult;
  editorial: EditorialScanResult;
  grounding: GroundingReport | null;
}

@Injectable()
export class ArticlesService {
  private readonly logger = new Logger(ArticlesService.name);
  private readonly contentDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly markdown: MarkdownService,
    private readonly validation: ArticleValidationService,
    private readonly grounding: GroundingService,
    config: ConfigService<Env, true>,
  ) {
    this.contentDir = path.resolve(
      process.cwd(),
      config.get('CONTENT_DIR', { infer: true }),
    );
  }

  // ============================================
  // READS
  // ============================================

  /**
   * @param includeUnpublished only ever true for an authenticated caller. Drafts
   *   are unlisted content, and the site's /admin surface is the only thing that
   *   should see them.
   */
  async list(
    filter: ListArticlesDto,
    includeUnpublished: boolean,
  ): Promise<ArticleMetaResponse[]> {
    const where: Prisma.ArticleWhereInput = {};

    if (!includeUnpublished) {
      where.status = 'published';
    } else if (filter.status) {
      where.status = filter.status;
    }

    if (filter.category) where.category = filter.category;

    if (filter.q) {
      where.OR = [
        { title: { contains: filter.q, mode: 'insensitive' } },
        { slug: { contains: filter.q, mode: 'insensitive' } },
        { description: { contains: filter.q, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.article.findMany({
      where,
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });

    return rows.map(toMeta);
  }

  async findBySlug(
    slug: string,
    includeUnpublished: boolean,
  ): Promise<ArticleResponse> {
    const row = await this.prisma.article.findUnique({ where: { slug } });

    // An unauthenticated request for a draft gets 404, not 403 — the existence of
    // an unpublished slug is itself information.
    if (!row || (!includeUnpublished && row.status !== 'published')) {
      throw new NotFoundException(`No article with slug "${slug}"`);
    }

    // `includeUnpublished` doubles as "this caller is an editor", which is what
    // decides whether the markdown source comes back with it.
    return toFull(row, includeUnpublished);
  }

  /** Raw row, for internal callers that need the markdown body. */
  async requireRow(slug: string): Promise<ArticleRow> {
    const row = await this.prisma.article.findUnique({ where: { slug } });
    if (!row) throw new NotFoundException(`No article with slug "${slug}"`);
    return row;
  }

  // ============================================
  // WRITES
  // ============================================

  async save(dto: SaveArticleDto, options: SaveOptions = {}): Promise<SaveResult> {
    const existing = await this.prisma.article.findUnique({
      where: { slug: dto.slug },
    });

    // publishedAt is set once and never reset. Google treats a changed publication
    // date on existing content as a signal worth distrusting, so an edit bumps
    // updatedAt only.
    const publishedAt = existing?.publishedAt ?? dto.publishedAt ?? today();
    const updatedAt = dto.updatedAt ?? today();
    const status: ArticleStatus =
      dto.status ?? (existing?.status as ArticleStatus | undefined) ?? 'draft';

    const frontmatter: ArticleFrontmatter = {
      title: dto.title,
      headline: dto.headline,
      slug: dto.slug,
      description: dto.description,
      primaryKeyword: dto.primaryKeyword,
      secondaryKeywords: dto.secondaryKeywords,
      category: dto.category,
      tags: dto.tags,
      author: dto.author,
      publishedAt,
      updatedAt,
      status: status as ArticleStatus,
      heroImage: dto.heroImage,
      cves: dto.cves ?? [],
      sources: dto.sources as Source[],
      canonical: dto.canonical ?? '',
    };

    const errors = this.validation.validate(frontmatter, dto.body);
    if (errors.length) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Article failed validation',
        errors,
      });
    }

    const briefId = dto.briefId ?? existing?.briefId ?? null;
    let grounding: GroundingReport | null = null;

    if (briefId) {
      grounding = await this.grounding.check(briefId, frontmatter, dto.body);
      if (
        options.enforceGrounding &&
        (grounding.unsourcedCves.length || grounding.unsourcedIndicators.length)
      ) {
        const parts: string[] = [];
        if (grounding.unsourcedCves.length) {
          parts.push('CVE identifiers');
        }
        if (grounding.unsourcedIndicators.length) {
          parts.push('indicators of compromise');
        }
        throw new BadRequestException({
          statusCode: 400,
          message:
            `Article contains ${parts.join(' and ')} that appear in no source attached to its ` +
            'research brief. Every factual claim must trace to a fetched source — remove it, ' +
            'or research it first. An unverified IOC is acted on directly by the reader.',
          unsourcedCves: grounding.unsourcedCves,
          unsourcedIndicators: grounding.unsourcedIndicators,
          warnings: grounding.warnings,
        });
      }
    }

    const seo = await this.score(frontmatter, dto.body, dto.slug);
    const editorial = scanEditorial(dto.body);

    const wordCount = seo.stats.wordCount;
    const data = {
      title: dto.title,
      headline: dto.headline ?? null,
      description: dto.description,
      primaryKeyword: dto.primaryKeyword,
      secondaryKeywords: dto.secondaryKeywords,
      category: dto.category,
      tags: dto.tags,
      authorName: dto.author.name,
      authorTitle: dto.author.title ?? null,
      publishedAt,
      updatedAt,
      status,
      heroImageSrc: dto.heroImage?.src ?? null,
      heroImageAlt: dto.heroImage?.alt ?? null,
      cves: dto.cves ?? [],
      canonical: dto.canonical ?? '',
      body: dto.body,
      html: this.markdown.render(dto.body),
      wordCount,
      readingTime: Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE)),
      headings: this.markdown.tableOfContents(dto.body) as unknown as Prisma.InputJsonValue,
      seoScore: seo.score,
      seoMax: seo.max,
      seoBreakdown: seo.rows as unknown as Prisma.InputJsonValue,
      seoBlocking: seo.blocking,
      sources: dto.sources as unknown as Prisma.InputJsonValue,
      briefId,
    };

    const row = await this.prisma.article.upsert({
      where: { slug: dto.slug },
      create: { slug: dto.slug, ...data },
      update: data,
    });

    this.logger.log(
      `Saved ${row.slug} — ${wordCount}w, SEO ${seo.score}/${seo.max}${seo.blocking.length ? ' (blocking)' : ''}`,
    );

    return { article: toFull(row), seo, editorial, grounding };
  }

  /**
   * Surgical edit. `bodyFind` must match exactly once — an ambiguous match is a
   * failed edit, not a silent replace-first.
   */
  async patch(
    slug: string,
    dto: PatchArticleDto,
    options: SaveOptions = {},
  ): Promise<SaveResult> {
    const existing = await this.requireRow(slug);

    if (dto.bodyFind && dto.body) {
      throw new BadRequestException(
        'Pass either bodyFind/bodyReplace or body, not both.',
      );
    }

    let body = existing.body;
    if (dto.bodyFind) {
      const occurrences = body.split(dto.bodyFind).length - 1;
      if (occurrences === 0) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'bodyFind did not match the current body. Re-read the article and retry.',
          bodyFind: dto.bodyFind,
        });
      }
      if (occurrences > 1) {
        throw new BadRequestException({
          statusCode: 400,
          message: `bodyFind matched ${occurrences} times and must match exactly once. Include more surrounding text.`,
          bodyFind: dto.bodyFind,
        });
      }
      body = body.replace(dto.bodyFind, dto.bodyReplace ?? '');
    } else if (dto.body) {
      body = dto.body;
    }

    const current = toFull(existing);

    return this.save(
      {
        title: dto.title ?? current.title,
        headline: dto.headline ?? current.headline,
        slug,
        description: dto.description ?? current.description,
        primaryKeyword: dto.primaryKeyword ?? current.primaryKeyword,
        secondaryKeywords: dto.secondaryKeywords ?? current.secondaryKeywords,
        category: dto.category ?? current.category,
        tags: dto.tags ?? current.tags,
        author: dto.author ?? current.author,
        publishedAt: current.publishedAt,
        // Any substantive edit bumps dateModified, which is what Google reads for
        // news freshness.
        updatedAt: today(),
        status: current.status,
        heroImage: dto.heroImage ?? current.heroImage,
        cves: dto.cves ?? current.cves,
        sources: dto.sources ?? current.sources,
        canonical: dto.canonical ?? current.canonical,
        body,
        briefId: existing.briefId ?? undefined,
      },
      options,
    );
  }

  /**
   * Moves an article between `draft` and `review`. `published` is deliberately not
   * reachable here — PublishService owns that transition and its preflight.
   */
  async setStatus(slug: string, status: 'draft' | 'review'): Promise<ArticleResponse> {
    const existing = await this.requireRow(slug);

    if (status === 'review' && existing.seoBlocking.length) {
      throw new BadRequestException({
        statusCode: 400,
        message:
          'Cannot move to review while a required rubric row is failing. Fix these first.',
        seoBlocking: existing.seoBlocking,
      });
    }

    const row = await this.prisma.article.update({
      where: { slug },
      data: { status },
    });

    return toFull(row);
  }

  /**
   * Deletes the row, then the markdown publication exported for it.
   *
   * Removing the file is not a lost review trail — git history holds every
   * version this repo ever published. Leaving it is the actual danger: the file
   * is an input to `npm run import`, so a delete that stops at the database is
   * undone the next time content is loaded, which looks like the article coming
   * back from nowhere.
   *
   * ENOENT is the ordinary case rather than a problem. Only a published article
   * was ever exported, and drafts outnumber publications.
   */
  async remove(slug: string): Promise<void> {
    await this.requireRow(slug);
    await this.prisma.article.delete({ where: { slug } });

    try {
      await unlink(articleExportPath(this.contentDir, slug));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        // The row is already gone and the database is the source of truth, so
        // this is a warning rather than a failure — the same call publish makes
        // when it cannot write the export on an ephemeral filesystem.
        this.logger.warn(
          `Deleted ${slug} but could not remove its markdown: ${(error as Error).message}`,
        );
      }
    }
  }

  // ============================================
  // SCORING
  // ============================================

  /**
   * Scores against the docs/seo-checklist.md rubric.
   *
   * `totalArticles` excludes the article being scored, because row 10 (internal
   * links) is relaxed only while there is genuinely nothing to link to.
   */
  async score(
    frontmatter: Partial<ArticleFrontmatter>,
    body: string,
    slugToExclude?: string,
  ): Promise<SeoResult> {
    const totalArticles = await this.prisma.article.count({
      where: slugToExclude ? { slug: { not: slugToExclude } } : {},
    });
    return scoreArticle(frontmatter, body, { totalArticles: totalArticles + 1 });
  }

  /** Rescores a stored article and persists the result. */
  async rescore(slug: string): Promise<SaveResult> {
    const row = await this.requireRow(slug);
    const current = toFull(row);
    const seo = await this.score(current, row.body, slug);
    const editorial = scanEditorial(row.body);

    const updated = await this.prisma.article.update({
      where: { slug },
      data: {
        seoScore: seo.score,
        seoMax: seo.max,
        seoBreakdown: seo.rows as unknown as Prisma.InputJsonValue,
        seoBlocking: seo.blocking,
      },
    });

    const grounding = row.briefId
      ? await this.grounding.check(row.briefId, current, row.body)
      : null;

    return { article: toFull(updated), seo, editorial, grounding };
  }
}
