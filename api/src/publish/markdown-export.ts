import path from 'node:path';
import type { Article as ArticleRow } from '@prisma/client';
import type { Source } from '../seo/article.types';

/**
 * Where `toMarkdown`'s output lives on disk.
 *
 * Publishing writes this path and deleting removes it, from two different
 * services that cannot import each other — PublishModule imports ArticlesModule,
 * so the dependency only runs one way. Both sides calling one function is what
 * stops the layout of `content/` from being encoded twice and drifting.
 */
export function articleExportPath(contentDir: string, slug: string): string {
  return path.join(contentDir, 'articles', `${slug}.md`);
}

/**
 * Serializes an article row back to the markdown format in
 * docs/frontmatter-schema.md.
 *
 * Hand-written rather than handed to js-yaml's `dump`. The export exists so a
 * published article can be reviewed in `git diff`, and a generic YAML emitter
 * defeats that: it reorders nested keys, expands the flow-style `tags` list to
 * one item per line, and drops quotes that the schema example carries. The result
 * is a sixty-line reformatting diff on every republish, burying the two lines
 * that actually changed.
 *
 * The schema is sixteen known fields. Emitting them directly costs less than
 * fighting a general-purpose serializer into matching, and the output is stable
 * across runs by construction.
 */
export function toMarkdown(row: ArticleRow): string {
  const lines: string[] = ['---'];

  lines.push(`title: ${quote(row.title)}`);
  if (row.headline) lines.push(`headline: ${quote(row.headline)}`);
  lines.push(`slug: ${row.slug}`);
  lines.push(`description: ${quote(row.description)}`);
  lines.push(`primaryKeyword: ${quote(row.primaryKeyword)}`);

  lines.push('secondaryKeywords:');
  for (const keyword of row.secondaryKeywords) {
    lines.push(`  - ${quote(keyword)}`);
  }

  lines.push(`category: ${row.category}`);
  // Tags are short and unquoted, so flow style stays readable and keeps a tag
  // change to a one-line diff.
  lines.push(`tags: [${row.tags.join(', ')}]`);

  lines.push('author:');
  lines.push(`  name: ${quote(row.authorName)}`);
  if (row.authorTitle) lines.push(`  title: ${quote(row.authorTitle)}`);

  // Dates stay unquoted, matching the schema example. gray-matter parses them
  // back into Date objects, which toDateString() normalises on import.
  lines.push(`publishedAt: ${row.publishedAt}`);
  lines.push(`updatedAt: ${row.updatedAt}`);
  lines.push(`status: ${row.status}`);

  if (row.heroImageSrc) {
    lines.push('heroImage:');
    lines.push(`  src: ${row.heroImageSrc}`);
    lines.push(`  alt: ${quote(row.heroImageAlt ?? '')}`);
  }

  if (row.cves.length) {
    lines.push('cves:');
    for (const cve of row.cves) lines.push(`  - ${cve}`);
  }

  const sources = (row.sources as unknown as Source[]) ?? [];
  lines.push('sources:');
  for (const source of sources) {
    lines.push(`  - title: ${quote(source.title)}`);
    lines.push(`    url: ${quote(source.url)}`);
    lines.push(`    publisher: ${quote(source.publisher)}`);
    lines.push(`    tier: ${source.tier}`);
    lines.push(`    accessedAt: ${source.accessedAt}`);
  }

  lines.push(`canonical: ${quote(row.canonical ?? '')}`);
  lines.push('---');
  lines.push('');
  lines.push(row.body.trim());
  lines.push('');

  return lines.join('\n');
}

/**
 * A YAML double-quoted scalar.
 *
 * JSON string syntax is a subset of YAML's double-quoted style — the same
 * backslash escapes, the same delimiters — so JSON.stringify produces a valid and
 * correctly escaped scalar for any input, including one containing a colon, a
 * quote, or a newline.
 */
function quote(value: string): string {
  return JSON.stringify(value);
}
