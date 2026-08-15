/**
 * Audits article markdown against the rubric, the ban list and the grounding gate.
 *
 *   npm run audit -- <slug>
 *   npm run audit -- <slug> --brief 2026-08-14-some-topic
 *   npm run audit -- ../content/articles/one.md ../content/articles/two.md
 *
 * No database and no Nest container: it imports the same `scoreArticle`,
 * `scanEditorial` and `checkGrounding` the API uses, and reads source text from
 * the sidecar directory a research session wrote. That matters because an
 * article is audited *before* it is imported — if this needed Postgres it could
 * not run at the point in the workflow where it is useful.
 *
 * Exit code is 1 when anything blocking is found, so a caller can loop on it:
 * audit, fix, audit again, stop when it exits 0.
 */

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { scoreArticle } from '../src/seo/seo-score';
import { scanEditorial } from '../src/seo/banned-terms';
import { checkGrounding, type StoredSource } from '../src/research/grounding.service';
import { toDateString } from '../src/seo/article-validation.service';
import type { ArticleFrontmatter } from '../src/seo/article.types';

const CONTENT_DIR = path.resolve(
  process.cwd(),
  process.env.CONTENT_DIR ?? '../content',
);

/** `content/research/<brief>.sources/*.md` — one file per fetched page. */
async function loadSidecar(briefSlug: string): Promise<StoredSource[]> {
  const dir = path.join(CONTENT_DIR, 'research', `${briefSlug}.sources`);
  if (!existsSync(dir)) return [];

  const out: StoredSource[] = [];
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.md'))) {
    const raw = await readFile(path.join(dir, file), 'utf8');
    const { data, content } = matter(raw);
    out.push({
      url: String(data.url ?? file),
      publisher: String(data.publisher ?? path.basename(file, '.md')),
      rawContent: content,
    });
  }
  return out;
}

function resolveArticle(target: string): string {
  if (target.endsWith('.md')) return path.resolve(process.cwd(), target);
  return path.join(CONTENT_DIR, 'articles', `${target}.md`);
}

async function main() {
  const args = process.argv.slice(2);
  const briefIdx = args.indexOf('--brief');
  const briefSlug = briefIdx === -1 ? undefined : args[briefIdx + 1];
  // `briefIdx + 1` is the slug that belongs to --brief. Guard the -1 case, or
  // index 0 gets swallowed whenever --brief is absent.
  const briefValueIdx = briefIdx === -1 ? -1 : briefIdx + 1;
  const targets = args.filter((a, i) => !a.startsWith('--') && i !== briefValueIdx);

  if (!targets.length) {
    console.error('Usage: npm run audit -- <slug|file.md> [--brief <brief-slug>]');
    process.exit(1);
  }

  // Row 10 relaxes only while the site has nothing to link to, so the count has
  // to be real. The filesystem is the source of truth before import.
  const articleDir = path.join(CONTENT_DIR, 'articles');
  const totalArticles = existsSync(articleDir)
    ? (await readdir(articleDir)).filter((f) => f.endsWith('.md')).length
    : 0;

  const sources = briefSlug ? await loadSidecar(briefSlug) : [];
  if (briefSlug && !sources.length) {
    console.log(
      `\n  ⚠ No sidecar at content/research/${briefSlug}.sources/ — grounding cannot run.\n` +
        '    A research session should write one file per fetched page there.',
    );
  }

  let failed = false;

  for (const target of targets) {
    const file = resolveArticle(target);
    if (!existsSync(file)) {
      console.error(`✗ No such article: ${file}`);
      failed = true;
      continue;
    }

    const raw = await readFile(file, 'utf8');
    const { data, content } = matter(raw);
    const frontmatter = {
      ...data,
      publishedAt: data.publishedAt ? toDateString(data.publishedAt) : undefined,
      updatedAt: data.updatedAt ? toDateString(data.updatedAt) : undefined,
    } as Partial<ArticleFrontmatter>;

    const seo = scoreArticle(frontmatter, content, { totalArticles });
    const ed = scanEditorial(content);

    console.log(`\n${'═'.repeat(72)}`);
    console.log(`Audit — ${path.basename(file, '.md')}`);
    console.log(
      `Score: ${seo.score}/${seo.max}  ·  status: ${data.status ?? '?'}  ·  ${seo.stats.wordCount} words\n`,
    );

    for (const row of seo.rows) {
      const mark =
        row.status === 'pass' ? '  ok ' : row.status === 'warn' ? '  !  ' : row.required ? ' FAIL' : ' fail';
      console.log(`  ${mark} ${String(row.n).padStart(2)}. ${row.name.padEnd(20)} ${row.detail}`);
    }

    if (seo.blocking.length) {
      failed = true;
      console.log('\n  Blocking — publication is refused until these pass:');
      for (const b of seo.blocking) console.log(`    ✗ ${b}`);
    }

    const violations = ed.hits.filter((h) => h.severity === 'violation');
    if (violations.length || ed.openerViolation || ed.transitionChains.length) {
      failed = true;
      console.log('\n  Editorial violations:');
      if (ed.openerViolation) {
        console.log(`    ✗ banned lede opener (${ed.openerViolation.term})`);
      }
      for (const h of violations) {
        console.log(`    ✗ L${h.line} ${h.term}: "${h.text.slice(0, 70)}"`);
      }
      for (const c of ed.transitionChains) {
        console.log(`    ✗ L${c.line} transition chain: "${c.text.slice(0, 70)}"`);
      }
    }

    const advisories = ed.hits.filter((h) => h.severity === 'advisory');
    if (advisories.length) {
      console.log('\n  Editorial advisories (read the line before changing it):');
      for (const h of advisories) {
        console.log(`    · L${h.line} ${h.term}${h.note ? ` — ${h.note}` : ''}`);
      }
    }

    if (sources.length) {
      const g = checkGrounding(briefSlug!, sources, frontmatter, content);
      console.log(
        `\n  Grounding (${sources.length} stored source(s)):` +
          `\n    ${g.groundedCves.length} CVE(s) traced, ${g.unsourcedCves.length} not found` +
          `\n    ${g.groundedIndicators.length} indicator(s) traced, ${g.unsourcedIndicators.length} not found`,
      );
      for (const bad of [...g.unsourcedCves, ...g.unsourcedIndicators]) {
        failed = true;
        console.log(`    ✗ ${bad} — in NO stored source. Remove it or verify it.`);
      }
      for (const w of g.warnings) console.log(`    · ${w}`);
    }
  }

  console.log(`\n${'═'.repeat(72)}`);
  console.log(failed ? '\n  Audit failed — fix the ✗ items and run again.\n' : '\n  Audit clean.\n');
  process.exit(failed ? 1 : 0);
}

void main().catch((error) => {
  console.error((error as Error).stack ?? String(error));
  process.exit(1);
});
