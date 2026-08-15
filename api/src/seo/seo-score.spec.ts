import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { scoreArticle, countWords, toProse, extractHeadings } from './seo-score';
import { toDateString } from './article-validation.service';
import type { ArticleFrontmatter, SeoRow } from './article.types';

/**
 * Equivalence test for the port of scripts/seo-score.mjs.
 *
 * The expected values below are the output the .mjs original produces for the one
 * article that exists in content/articles/. If this port ever drifts from the
 * script the Claude Code workflow still uses, an article would score differently
 * depending on which half of the system looked at it — which is exactly the bug
 * this test exists to catch.
 *
 * The article markdown is the fixture rather than the generated JSON under
 * app/public/content/, because that directory is gitignored build output and is
 * absent from a fresh clone.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..');
const ARTICLE_PATH = join(
  REPO_ROOT,
  'content',
  'articles',
  'ptc-windchill-vulnerability-clop-exploitation.md',
);

const EXPECTED_ROWS: SeoRow[] = [
  { n: 1, name: 'Title tag', status: 'pass', detail: '59 chars, keyword in first 5 words', required: true },
  { n: 2, name: 'H1', status: 'pass', detail: 'one, from frontmatter', required: true },
  { n: 3, name: 'Meta description', status: 'pass', detail: '158 chars (150–160), keyword ✓', required: true },
  { n: 4, name: 'Slug', status: 'pass', detail: '5 words', required: true },
  { n: 5, name: 'Keyword placement', status: 'pass', detail: 'first 100 words ✓, H2 ✓', required: true },
  { n: 6, name: 'Keyword density', status: 'pass', detail: '4 uses (target 4–8)', required: false },
  { n: 7, name: 'Secondary keywords', status: 'pass', detail: '4 declared, all used', required: false },
  { n: 8, name: 'Heading hierarchy', status: 'pass', detail: 'clean, question-form H2 ✓', required: false },
  { n: 9, name: 'Length', status: 'pass', detail: '1107 words (900–1400)', required: false },
  { n: 10, name: 'Internal links', status: 'pass', detail: '0 — no other articles exist yet', required: false },
  { n: 11, name: 'External links', status: 'pass', detail: '4 (minimum 3)', required: true },
  { n: 12, name: 'Images', status: 'warn', detail: 'no hero image declared', required: false },
  { n: 13, name: 'Schema', status: 'pass', detail: 'complete', required: true },
  { n: 14, name: 'Featured snippet', status: 'pass', detail: '51 words under "What is CVE-2026-12569?"', required: false },
  { n: 15, name: 'Readability', status: 'pass', detail: 'avg 20.5 words/sentence, Flesch 43.2', required: false },
];

describe('scoreArticle (port of scripts/seo-score.mjs)', () => {
  const raw = readFileSync(ARTICLE_PATH, 'utf8');
  const parsed = matter(raw);
  const data = {
    ...parsed.data,
    publishedAt: toDateString(parsed.data.publishedAt),
    updatedAt: toDateString(parsed.data.updatedAt),
  } as Partial<ArticleFrontmatter>;
  const body = parsed.content;

  // totalArticles: 1 matches the build script's context for a single-article repo,
  // which is what relaxes row 10.
  const result = scoreArticle(data, body, { totalArticles: 1 });

  it('scores 14 of 15 with nothing blocking', () => {
    expect(result.score).toBe(14);
    expect(result.max).toBe(15);
    expect(result.blocking).toEqual([]);
  });

  it('reproduces every rubric row exactly', () => {
    expect(result.rows).toEqual(EXPECTED_ROWS);
  });

  it.each(EXPECTED_ROWS)('row $n ($name) is $status', (expected) => {
    const actual = result.rows.find((r) => r.n === expected.n);
    expect(actual).toEqual(expected);
  });

  it('counts 1107 body words', () => {
    expect(countWords(toProse(body))).toBe(1107);
  });

  it('extracts the six H2s and no H1', () => {
    const headings = extractHeadings(body);
    expect(headings.filter((h) => h.level === 1)).toHaveLength(0);
    expect(headings.filter((h) => h.level === 2).map((h) => h.text)).toEqual([
      'What is CVE-2026-12569?',
      'How the PTC Windchill vulnerability is being exploited',
      'Who is behind it',
      'Who is exposed',
      'What to do now',
      'What is still unknown',
    ]);
  });
});
