import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { WebFetchService } from '../tools/web-fetch.service';
import { ArticlesService } from '../articles/articles.service';
import { GroundingService } from '../research/grounding.service';
import { PUBLISH_LIMITS } from '../common/constants/limits';
import { today } from '../seo/article-validation.service';
import { toFull, sourcesOf, type ArticleResponse } from '../articles/article.mapper';
import { articleExportPath, toMarkdown } from './markdown-export';
import type { Env } from '../config/env.schema';

export interface PreflightReport {
  slug: string;
  ok: boolean;
  /** Conditions that must be met before publication. Any failure blocks. */
  blockers: string[];
  /** Worth the operator's attention, but not blocking. */
  warnings: string[];
  sourceChecks: { url: string; ok: boolean; status: number | null; detail?: string }[];
}

export interface PublishResult {
  article: ArticleResponse;
  preflight: PreflightReport;
  /** Path the markdown was exported to, or null when the export was skipped. */
  exportedTo: string | null;
  exportError?: string;
}

/**
 * Publication and its preflight.
 *
 * .claude/skills/publish/SKILL.md lists conditions under which the skill must
 * refuse. Those were instructions to a model; here they are conditions in code,
 * because the one irreversible step in this pipeline is the one that should not
 * depend on a model choosing to comply.
 */
@Injectable()
export class PublishService {
  private readonly logger = new Logger(PublishService.name);
  private readonly contentDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly articles: ArticlesService,
    private readonly webFetch: WebFetchService,
    private readonly grounding: GroundingService,
    config: ConfigService<Env, true>,
  ) {
    this.contentDir = path.resolve(
      process.cwd(),
      config.get('CONTENT_DIR', { infer: true }),
    );
  }

  /** Runs every check without changing anything. */
  async preflight(slug: string): Promise<PreflightReport> {
    const row = await this.articles.requireRow(slug);
    const blockers: string[] = [];
    const warnings: string[] = [];

    if (row.status === 'published') {
      warnings.push('Already published. Publishing again refreshes updatedAt only.');
    } else if (row.status !== 'review') {
      blockers.push(
        `Status is "${row.status}". An article must pass an audit and reach "review" before it can be published.`,
      );
    }

    if (row.seoBlocking.length) {
      blockers.push(
        `${row.seoBlocking.length} required rubric row(s) failing: ${row.seoBlocking.join('; ')}`,
      );
    }

    if (row.seoScore < PUBLISH_LIMITS.minSeoScore) {
      blockers.push(
        `SEO score is ${row.seoScore}/${row.seoMax}; ${PUBLISH_LIMITS.minSeoScore} is the minimum for publication.`,
      );
    }

    const sources = sourcesOf(row);
    if (sources.length < PUBLISH_LIMITS.minSources) {
      blockers.push(
        `${sources.length} source(s); ${PUBLISH_LIMITS.minSources} independent sources is the minimum.`,
      );
    }

    // Every source URL must still resolve. Security advisories get moved and
    // pulled, and a citation to a dead URL is unverifiable by a reader.
    const sourceChecks = await this.webFetch.verifyUrls(sources.map((s) => s.url));
    const dead = sourceChecks.filter((c) => !c.ok);
    if (dead.length) {
      blockers.push(
        `${dead.length} source URL(s) unreachable: ${dead
          .map((d) => `${d.url} (${d.detail ?? `HTTP ${d.status}`})`)
          .join('; ')}`,
      );
    }

    if (!sources.some((s) => s.tier === 1)) {
      warnings.push(
        'No Tier 1 source. docs/sources.md expects a primary advisory to anchor the piece.',
      );
    }

    if (row.briefId) {
      const grounding = await this.grounding.check(row.briefId, toFull(row), row.body);
      if (grounding.unsourcedCves.length) {
        blockers.push(
          `CVE identifier(s) not found in any fetched source: ${grounding.unsourcedCves.join(', ')}`,
        );
      }
      if (grounding.unsourcedIndicators.length) {
        blockers.push(
          `Indicator(s) of compromise not found in any fetched source: ${grounding.unsourcedIndicators.join(', ')}. ` +
            'Readers block addresses and hunt hashes on these — do not publish one that could not be verified.',
        );
      }
      warnings.push(...grounding.warnings);
    } else {
      warnings.push(
        'No research brief is linked, so no claim in this article could be checked against a fetched source.',
      );
    }

    return { slug, ok: blockers.length === 0, blockers, warnings, sourceChecks };
  }

  async publish(slug: string): Promise<PublishResult> {
    const preflight = await this.preflight(slug);

    if (!preflight.ok) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Article is not ready to publish',
        blockers: preflight.blockers,
        warnings: preflight.warnings,
      });
    }

    const existing = await this.articles.requireRow(slug);

    const row = await this.prisma.article.update({
      where: { slug },
      data: {
        status: 'published',
        // publishedAt is set once. Google treats a changed publication date on
        // existing content as a signal worth distrusting, so a republish moves
        // dateModified only.
        publishedAt: existing.status === 'published' ? existing.publishedAt : today(),
        updatedAt: today(),
      },
    });

    const article = toFull(row);
    let exportedTo: string | null = null;
    let exportError: string | undefined;

    try {
      const file = articleExportPath(this.contentDir, slug);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, toMarkdown(row), 'utf8');
      exportedTo = file;
    } catch (error) {
      // On a host with an ephemeral filesystem there is nowhere durable to write.
      // That is a lost review trail, not a failed publication — the database is
      // the source of truth and the article is already live.
      exportError = (error as Error).message;
      this.logger.warn(
        `Published ${slug} but could not export markdown: ${exportError}`,
      );
    }

    this.logger.log(
      `Published ${slug} — SEO ${row.seoScore}/${row.seoMax}${exportedTo ? `, exported to ${exportedTo}` : ''}`,
    );

    return { article, preflight, exportedTo, exportError };
  }

  /** Returns a published article to review status. */
  async unpublish(slug: string): Promise<ArticleResponse> {
    const row = await this.prisma.article.update({
      where: { slug },
      data: { status: 'review', updatedAt: today() },
    });
    this.logger.log(`Unpublished ${slug}`);
    return toFull(row);
  }
}
