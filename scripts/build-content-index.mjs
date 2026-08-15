#!/usr/bin/env node
/**
 * Turns content/articles/*.md into JSON the Angular app consumes.
 *
 *   node scripts/build-content-index.mjs
 *   node scripts/build-content-index.mjs --watch
 *
 * Emits to app/public/content/:
 *   index.json          — all articles, metadata only (no html), newest first
 *   articles/<slug>.json — full article including rendered html
 *
 * Never hand-edit the output. Fix the markdown and rebuild.
 */

import { readFile, writeFile, readdir, mkdir, rm } from 'node:fs/promises';
import { existsSync, watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import { scoreArticle, toProse, countWords, extractHeadings } from './seo-score.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTICLES_DIR = path.join(ROOT, 'content', 'articles');
const PUBLIC_DIR = path.join(ROOT, 'app', 'public');
const OUT_DIR = path.join(PUBLIC_DIR, 'content');
const SITE = JSON.parse(await readFile(path.join(ROOT, 'site.config.json'), 'utf8'));

const CATEGORIES = ['vulnerabilities', 'breaches', 'ransomware', 'threat-intel', 'policy', 'ai-security'];
const STATUSES = ['draft', 'review', 'published'];
const WORDS_PER_MINUTE = 225;

const md = new MarkdownIt({ html: true, linkify: true, typographer: true });

// Open external links in a new tab; leave internal routing alone.
const defaultLinkOpen = md.renderer.rules.link_open
  || ((tokens, i, opts, _env, self) => self.renderToken(tokens, i, opts));
md.renderer.rules.link_open = (tokens, i, opts, env, self) => {
  const href = tokens[i].attrGet('href') || '';
  if (/^https?:\/\//i.test(href)) {
    tokens[i].attrSet('target', '_blank');
    tokens[i].attrSet('rel', 'noopener noreferrer');
  }
  return defaultLinkOpen(tokens, i, opts, env, self);
};

// Stable heading ids so the table of contents can anchor.
md.renderer.rules.heading_open = (tokens, i, opts, _env, self) => {
  const inline = tokens[i + 1];
  if (inline?.type === 'inline') {
    tokens[i].attrSet('id', slugifyHeading(inline.content));
  }
  return self.renderToken(tokens, i, opts);
};

function slugifyHeading(text) {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
}

/** Throws on anything that would produce a broken page. Warnings go to the SEO score instead. */
function validate(data, body, filename) {
  const errors = [];
  const req = (field, value) => { if (value === undefined || value === null || value === '') errors.push(`missing required field: ${field}`); };

  req('title', data.title);
  req('slug', data.slug);
  req('description', data.description);
  req('primaryKeyword', data.primaryKeyword);
  req('category', data.category);
  req('status', data.status);
  req('publishedAt', data.publishedAt);
  req('updatedAt', data.updatedAt);
  req('author.name', data.author?.name);

  const expectedSlug = path.basename(filename, '.md');
  if (data.slug && data.slug !== expectedSlug) {
    errors.push(`slug "${data.slug}" does not match filename "${expectedSlug}"`);
  }
  if (data.category && !CATEGORIES.includes(data.category)) {
    errors.push(`category "${data.category}" not one of: ${CATEGORIES.join(', ')}`);
  }
  if (data.status && !STATUSES.includes(data.status)) {
    errors.push(`status "${data.status}" not one of: ${STATUSES.join(', ')}`);
  }
  if (!Array.isArray(data.secondaryKeywords) || data.secondaryKeywords.length === 0) {
    errors.push('secondaryKeywords must be a non-empty array');
  }
  if (!Array.isArray(data.tags) || data.tags.length === 0) {
    errors.push('tags must be a non-empty array');
  }

  const sources = data.sources;
  if (!Array.isArray(sources) || sources.length < 3) {
    errors.push(`sources: ${Array.isArray(sources) ? sources.length : 0} found, minimum 3`);
  } else {
    sources.forEach((s, i) => {
      if (!s?.url) errors.push(`sources[${i}]: missing url`);
      if (!s?.tier) errors.push(`sources[${i}]: missing tier`);
      if (!s?.title) errors.push(`sources[${i}]: missing title`);
    });
  }

  for (const cve of data.cves || []) {
    if (!/^CVE-\d{4}-\d{4,}$/.test(cve)) errors.push(`malformed CVE id: "${cve}"`);
  }
  if (data.heroImage?.src && !data.heroImage?.alt) {
    errors.push('heroImage.src set without alt text');
  }
  for (const field of ['publishedAt', 'updatedAt']) {
    const v = data[field];
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(toDateString(v))) {
      errors.push(`${field} must be YYYY-MM-DD`);
    }
  }
  if (!body.trim()) errors.push('body is empty');

  // The page H1 is rendered from `headline` (or `title`). An H1 in the body
  // would give the page two, which search engines treat as a structural error.
  const bodyH1s = (body.replace(/```[\s\S]*?```/g, '').match(/^#\s+.+$/gm) || []).length;
  if (bodyH1s) {
    errors.push(`body contains ${bodyH1s} H1 heading(s) — move it to the \`headline\` frontmatter field and start the body at H2`);
  }

  return errors;
}

/** gray-matter parses unquoted YAML dates into Date objects. Normalize back. */
function toDateString(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

async function buildOne(filename, ctx) {
  const full = path.join(ARTICLES_DIR, filename);
  const raw = await readFile(full, 'utf8');
  const { data, content } = matter(raw);

  const errors = validate(data, content, filename);
  if (errors.length) return { filename, errors };

  const prose = toProse(content);
  const wordCount = countWords(prose);
  const seo = scoreArticle(data, content, ctx);

  const article = {
    ...data,
    publishedAt: toDateString(data.publishedAt),
    updatedAt: toDateString(data.updatedAt),
    sources: (data.sources || []).map((s) => ({ ...s, accessedAt: toDateString(s.accessedAt) })),
    wordCount,
    readingTime: Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE)),
    headings: extractHeadings(content)
      .filter((h) => h.level === 2 || h.level === 3)
      .map((h) => ({ ...h, id: slugifyHeading(h.text) })),
    seoScore: seo.score,
    seoMax: seo.max,
    seoBreakdown: seo.rows,
    seoBlocking: seo.blocking,
    html: md.render(content),
  };

  return { filename, article };
}

async function build() {
  if (!existsSync(ARTICLES_DIR)) {
    console.log(`No ${path.relative(ROOT, ARTICLES_DIR)} yet — nothing to build.`);
    await emit([]);
    return { ok: true, count: 0 };
  }

  const files = (await readdir(ARTICLES_DIR)).filter((f) => f.endsWith('.md'));
  const ctx = { totalArticles: files.length };

  const results = await Promise.all(files.map((f) => buildOne(f, ctx)));
  const failed = results.filter((r) => r.errors);
  const articles = results.filter((r) => r.article).map((r) => r.article);

  articles.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0));
  await emit(articles);

  for (const f of failed) {
    console.error(`\n  ✗ ${f.filename}`);
    for (const e of f.errors) console.error(`      ${e}`);
  }

  const byStatus = articles.reduce((acc, a) => ({ ...acc, [a.status]: (acc[a.status] || 0) + 1 }), {});
  const summary = STATUSES.filter((s) => byStatus[s]).map((s) => `${byStatus[s]} ${s}`).join(', ') || 'none';
  console.log(`\n  ${articles.length} article(s) indexed — ${summary}`);
  for (const a of articles) {
    console.log(`      ${a.slug}  ${a.wordCount}w  SEO ${a.seoScore}/${a.seoMax}${a.seoBlocking.length ? '  ⚠ blocking' : ''}`);
  }
  if (failed.length) console.error(`\n  ${failed.length} file(s) failed validation.\n`);

  return { ok: failed.length === 0, count: articles.length };
}

async function emit(articles) {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(path.join(OUT_DIR, 'articles'), { recursive: true });

  // index.json is fetched on every page load — keep html and breakdown out of it.
  const index = articles.map(({ html, seoBreakdown, sources, ...meta }) => ({
    ...meta,
    sourceCount: sources.length,
  }));

  await writeFile(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2));
  await Promise.all(
    articles.map((a) => writeFile(path.join(OUT_DIR, 'articles', `${a.slug}.json`), JSON.stringify(a, null, 2)))
  );

  const published = articles.filter((a) => a.status === 'published');
  await writeFile(path.join(PUBLIC_DIR, 'sitemap.xml'), sitemap(published));
  await writeFile(path.join(PUBLIC_DIR, 'rss.xml'), rss(published));
  await writeFile(path.join(PUBLIC_DIR, 'robots.txt'), robots());
}

const xmlEscape = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const url = (p) => `${SITE.origin.replace(/\/$/, '')}${p}`;

function sitemap(articles) {
  const categories = [...new Set(articles.map((a) => a.category))];
  const tags = [...new Set(articles.flatMap((a) => a.tags))];
  const latest = articles[0]?.updatedAt ?? new Date().toISOString().slice(0, 10);

  const entry = (loc, lastmod, priority) =>
    `  <url>\n    <loc>${xmlEscape(url(loc))}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${priority}</priority>\n  </url>`;

  const entries = [
    entry('/', latest, '1.0'),
    ...articles.map((a) => entry(`/article/${a.slug}`, a.updatedAt, '0.8')),
    ...categories.map((c) => entry(`/category/${c}`, latest, '0.6')),
    ...tags.map((t) => entry(`/tag/${encodeURIComponent(t)}`, latest, '0.4')),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
}

function rss(articles) {
  const items = articles
    .slice(0, 50)
    .map((a) => {
      const link = url(`/article/${a.slug}`);
      return [
        '    <item>',
        `      <title>${xmlEscape(a.title)}</title>`,
        `      <link>${xmlEscape(link)}</link>`,
        `      <guid isPermaLink="true">${xmlEscape(link)}</guid>`,
        `      <description>${xmlEscape(a.description)}</description>`,
        `      <category>${xmlEscape(a.category)}</category>`,
        `      <author>${xmlEscape(a.author.name)}</author>`,
        `      <pubDate>${new Date(`${a.publishedAt}T00:00:00Z`).toUTCString()}</pubDate>`,
        '    </item>',
      ].join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${xmlEscape(SITE.name)}</title>`,
    `    <link>${xmlEscape(SITE.origin)}</link>`,
    `    <description>${xmlEscape(SITE.description)}</description>`,
    `    <language>${xmlEscape(SITE.language)}</language>`,
    `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${xmlEscape(url('/rss.xml'))}" rel="self" type="application/rss+xml"/>`,
    items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}

function robots() {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    '',
    `Sitemap: ${url('/sitemap.xml')}`,
    '',
  ].join('\n');
}

const isWatch = process.argv.includes('--watch');
const result = await build();

if (isWatch) {
  console.log(`\n  Watching ${path.relative(ROOT, ARTICLES_DIR)} …\n`);
  let pending;
  watch(ARTICLES_DIR, { recursive: true }, () => {
    clearTimeout(pending);
    pending = setTimeout(() => build().catch((e) => console.error(e)), 150);
  });
} else if (!result.ok) {
  process.exit(1);
}
