/**
 * Mirrors docs/frontmatter-schema.md and app/src/app/core/models/article.model.ts.
 *
 * These three definitions must agree. The markdown is what a human reviews, the
 * Angular model is what the page renders, and this is what every write path is
 * validated against.
 */

export const ARTICLE_CATEGORIES = [
  'vulnerabilities',
  'breaches',
  'ransomware',
  'threat-intel',
  'policy',
  'ai-security',
] as const;

export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number];

export const ARTICLE_STATUSES = ['draft', 'review', 'published'] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

export const BRIEF_STATUSES = ['ready', 'needs-follow-up'] as const;
export type BriefStatus = (typeof BRIEF_STATUSES)[number];

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

/** The frontmatter block, as parsed from markdown or assembled by a tool call. */
export interface ArticleFrontmatter {
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
  sources: Source[];
  canonical?: string;
}

export interface SeoResult {
  score: number;
  max: number;
  rows: SeoRow[];
  /** Human-readable descriptions of failing required rows. Non-empty blocks publication. */
  blocking: string[];
  stats: {
    wordCount: number;
    internalLinks: number;
    externalLinks: number;
    keywordCount: number;
  };
}
