/**
 * Mirrors docs/frontmatter-schema.md. Keep in sync — the build script
 * (scripts/build-content-index.mjs) validates the markdown against the same rules.
 */

export type ArticleCategory =
  | 'vulnerabilities'
  | 'breaches'
  | 'ransomware'
  | 'threat-intel'
  | 'policy'
  | 'ai-security';

export type ArticleStatus = 'draft' | 'review' | 'published';

export const ARTICLE_CATEGORIES: readonly ArticleCategory[] = [
  'vulnerabilities',
  'breaches',
  'ransomware',
  'threat-intel',
  'policy',
  'ai-security',
] as const;

export const ARTICLE_STATUSES: readonly ArticleStatus[] = ['draft', 'review', 'published'] as const;

export interface Author {
  name: string;
  title?: string;
}

export interface HeroImage {
  src: string;
  alt: string;
}

export interface Source {
  title: string;
  url: string;
  publisher: string;
  /** 1 = primary (vendor advisory, CISA, NVD), 2 = credible reporting, 3 = lead only. */
  tier: 1 | 2 | 3;
  accessedAt: string;
}

export interface Heading {
  level: number;
  text: string;
  id: string;
}


/** One row of the docs/seo-checklist.md rubric. */
export interface SeoRow {
  n: number;
  name: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
  required: boolean;
}

/** Metadata only — what index.json carries. Excludes rendered html and full sources. */
export interface ArticleMeta {
  /** The `<title>` tag and SERP headline. Optimized for click-through, ≤60 chars. */
  title: string;
  /** The on-page `<h1>`. Optional — falls back to `title` when absent. */
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
  /** Non-empty when a required rubric row failed — blocks publication. */
  seoBlocking: string[];
  sourceCount: number;
}

/** A single article's full record, including rendered body. */
export interface Article extends Omit<ArticleMeta, 'sourceCount'> {
  html: string;
  sources: Source[];
  seoBreakdown: SeoRow[];
  /**
   * Markdown source. Returned only to an authenticated caller, so it is optional
   * here even though the row always has one — the public page renders `html`.
   */
  body?: string;
}
