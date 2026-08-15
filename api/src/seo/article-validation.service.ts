import { Injectable } from '@nestjs/common';
import {
  ARTICLE_CATEGORIES,
  ARTICLE_STATUSES,
  type ArticleFrontmatter,
} from './article.types';

/**
 * The validation rules from docs/frontmatter-schema.md, ported from the
 * `validate()` in scripts/build-content-index.mjs.
 *
 * Everything here produces a broken page if it ships, so it is an error rather
 * than a score deduction. Soft problems — title over 60 chars, description outside
 * 150–160, word count outside 900–1400 — belong to the SEO rubric, not here.
 *
 * Every save runs this before anything is persisted, which is what stops a
 * malformed draft from ever reaching the database.
 */
@Injectable()
export class ArticleValidationService {
  validate(data: Partial<ArticleFrontmatter>, body: string): string[] {
    const errors: string[] = [];

    const required: [string, unknown][] = [
      ['title', data.title],
      ['slug', data.slug],
      ['description', data.description],
      ['primaryKeyword', data.primaryKeyword],
      ['category', data.category],
      ['status', data.status],
      ['publishedAt', data.publishedAt],
      ['updatedAt', data.updatedAt],
      ['author.name', data.author?.name],
    ];
    for (const [field, value] of required) {
      if (value === undefined || value === null || value === '') {
        errors.push(`missing required field: ${field}`);
      }
    }

    if (data.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)) {
      errors.push(
        `slug "${data.slug}" must be lowercase words separated by single hyphens`,
      );
    }
    if (
      data.category &&
      !(ARTICLE_CATEGORIES as readonly string[]).includes(data.category)
    ) {
      errors.push(
        `category "${data.category}" not one of: ${ARTICLE_CATEGORIES.join(', ')}`,
      );
    }
    if (
      data.status &&
      !(ARTICLE_STATUSES as readonly string[]).includes(data.status)
    ) {
      errors.push(
        `status "${data.status}" not one of: ${ARTICLE_STATUSES.join(', ')}`,
      );
    }
    if (
      !Array.isArray(data.secondaryKeywords) ||
      data.secondaryKeywords.length === 0
    ) {
      errors.push('secondaryKeywords must be a non-empty array');
    }
    if (!Array.isArray(data.tags) || data.tags.length === 0) {
      errors.push('tags must be a non-empty array');
    }

    const sources = data.sources;
    if (!Array.isArray(sources) || sources.length < 3) {
      errors.push(
        `sources: ${Array.isArray(sources) ? sources.length : 0} found, minimum 3`,
      );
    } else {
      sources.forEach((s, i) => {
        if (!s?.url) errors.push(`sources[${i}]: missing url`);
        if (!s?.tier) errors.push(`sources[${i}]: missing tier`);
        if (!s?.title) errors.push(`sources[${i}]: missing title`);
        if (s?.tier !== undefined && ![1, 2, 3].includes(Number(s.tier))) {
          errors.push(`sources[${i}]: tier must be 1, 2 or 3`);
        }
      });
    }

    for (const cve of data.cves ?? []) {
      if (!/^CVE-\d{4}-\d{4,}$/.test(cve)) {
        errors.push(`malformed CVE id: "${cve}"`);
      }
    }

    if (data.heroImage?.src && !data.heroImage?.alt) {
      errors.push('heroImage.src set without alt text');
    }

    for (const field of ['publishedAt', 'updatedAt'] as const) {
      const value = data[field];
      if (value && !/^\d{4}-\d{2}-\d{2}$/.test(toDateString(value))) {
        errors.push(`${field} must be YYYY-MM-DD`);
      }
    }

    if (!body.trim()) errors.push('body is empty');

    // The page H1 is rendered from `headline` (or `title`). An H1 in the body
    // would give the page two, which search engines treat as a structural error.
    const bodyH1s = (
      body.replace(/```[\s\S]*?```/g, '').match(/^#\s+.+$/gm) ?? []
    ).length;
    if (bodyH1s) {
      errors.push(
        `body contains ${bodyH1s} H1 heading(s) — move it to the \`headline\` frontmatter field and start the body at H2`,
      );
    }

    return errors;
  }
}

/**
 * gray-matter parses unquoted YAML dates into Date objects. Normalize back to the
 * YYYY-MM-DD strings the schema specifies.
 */
export function toDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/** Today in the YYYY-MM-DD form every date field in the schema uses. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
