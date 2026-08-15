import type { Article as ArticleRow } from '@prisma/client';
import type {
  ArticleCategory,
  ArticleStatus,
  Author,
  Heading,
  HeroImage,
  SeoRow,
  Source,
} from '../seo/article.types';

/**
 * Response shapes. These are the contract with the Angular app — they must stay
 * identical to app/src/app/core/models/article.model.ts, which previously read
 * the same JSON from scripts/build-content-index.mjs. Changing a field name here
 * breaks the site silently, because ContentSource swallows errors.
 */

/** Metadata only. What the index endpoint returns — no rendered html, no sources. */
export interface ArticleMetaResponse {
  title: string;
  headline?: string;
  slug: string;
  description: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  category: ArticleCategory;
  tags: string[];
  author: Author;
  publishedAt: string;
  updatedAt: string;
  status: ArticleStatus;
  heroImage?: HeroImage;
  cves?: string[];
  canonical?: string;
  wordCount: number;
  readingTime: number;
  headings: Heading[];
  seoScore: number;
  seoMax: number;
  seoBlocking: string[];
  sourceCount: number;
}

/** A single article's full record, including rendered body. */
export interface ArticleResponse extends Omit<ArticleMetaResponse, 'sourceCount'> {
  html: string;
  sources: Source[];
  seoBreakdown: SeoRow[];
  /**
   * The markdown source, for authenticated callers only.
   *
   * The public page renders `html`, so shipping the markdown to every reader
   * would double the payload of the heaviest route for nobody's benefit. The
   * admin editor needs it, because you cannot edit rendered HTML back into
   * markdown.
   */
  body?: string;
}

function author(row: ArticleRow): Author {
  return row.authorTitle
    ? { name: row.authorName, title: row.authorTitle }
    : { name: row.authorName };
}

function heroImage(row: ArticleRow): HeroImage | undefined {
  // alt is required alongside src by the schema, so a src without one is a
  // validation failure upstream rather than something to paper over here.
  if (!row.heroImageSrc) return undefined;
  return { src: row.heroImageSrc, alt: row.heroImageAlt ?? '' };
}

function base(row: ArticleRow): Omit<ArticleMetaResponse, 'sourceCount'> {
  return {
    title: row.title,
    ...(row.headline ? { headline: row.headline } : {}),
    slug: row.slug,
    description: row.description,
    primaryKeyword: row.primaryKeyword,
    secondaryKeywords: row.secondaryKeywords,
    category: row.category as ArticleCategory,
    tags: row.tags,
    author: author(row),
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    status: row.status as ArticleStatus,
    ...(heroImage(row) ? { heroImage: heroImage(row) } : {}),
    cves: row.cves,
    canonical: row.canonical,
    wordCount: row.wordCount,
    readingTime: row.readingTime,
    headings: (row.headings as unknown as Heading[]) ?? [],
    seoScore: row.seoScore,
    seoMax: row.seoMax,
    seoBlocking: row.seoBlocking,
  };
}

export function toMeta(row: ArticleRow): ArticleMetaResponse {
  return {
    ...base(row),
    sourceCount: sourcesOf(row).length,
  };
}

export function toFull(row: ArticleRow, includeBody = false): ArticleResponse {
  return {
    ...base(row),
    html: row.html ?? '',
    sources: sourcesOf(row),
    seoBreakdown: (row.seoBreakdown as unknown as SeoRow[]) ?? [],
    ...(includeBody ? { body: row.body } : {}),
  };
}

export function sourcesOf(row: ArticleRow): Source[] {
  return (row.sources as unknown as Source[]) ?? [];
}
