/**
 * Imports the existing markdown in content/ into Postgres.
 *
 *   npm run import:content
 *   npm run import:content -- --force    # overwrite rows that already exist
 *
 * Runs through the real Nest services rather than talking to Prisma directly, so
 * an imported article is validated, scored and rendered by exactly the same code
 * that handles one the pipeline writes. If an existing article fails to import, that
 * is a genuine disagreement between the markdown and the schema, not an artefact
 * of a second parallel code path.
 *
 * Source text comes from the sidecar a research session writes next to each brief
 * — `content/research/<slug>.sources/*.md`, one file per fetched page, matched to
 * the brief's source list by URL. That text is what the grounding gate compares
 * CVE identifiers and indicators of compromise against.
 *
 * Grounding is enforced per brief rather than globally: a brief that arrived with
 * a sidecar gets its articles checked, and one without gets them imported
 * unenforced with a warning. The distinction matters because an empty corpus
 * fails every claim, which reports a gap in the research as though it were an
 * error in the writing — and an operator who sees that once stops reading the
 * check at all.
 */

import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import matter from 'gray-matter';
import { AppModule } from '../src/app.module';
import { ArticlesService } from '../src/articles/articles.service';
import { ResearchService } from '../src/research/research.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { toDateString } from '../src/seo/article-validation.service';
import type { SaveArticleDto } from '../src/articles/dto/save-article.dto';
import type { SaveBriefDto, ResearchSourceDto } from '../src/research/dto/save-brief.dto';

const CONTENT_DIR = path.resolve(
  process.cwd(),
  process.env.CONTENT_DIR ?? '../content',
);
const force = process.argv.includes('--force');

/** `- [S1] "Title" — Publisher — Tier 2 — https://url — accessed 2026-08-10` */
const SOURCE_LINE =
  /^-\s*\[S\d+\]\s*["“](?<title>[^"”]+)["”]\s*—\s*(?<publisher>[^—]+?)\s*—\s*Tier\s*(?<tier>[123])\s*—\s*(?<url>https?:\/\/\S+?)\s*—\s*accessed\s*(?<accessed>\d{4}-\d{2}-\d{2})/i;

/**
 * Page text saved next to the brief, keyed by URL.
 *
 * `content/research/<slug>.sources/*.md` — one file per page the research step
 * fetched, each carrying a `url` in its frontmatter. Without this the grounding
 * gate has nothing to compare against and passes vacuously, so the sidecar is
 * what makes the CVE and IOC checks mean anything.
 */
async function loadSidecar(briefDir: string, slug: string): Promise<Map<string, string>> {
  const dir = path.join(briefDir, `${slug}.sources`);
  const byUrl = new Map<string, string>();
  if (!existsSync(dir)) return byUrl;

  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.md'))) {
    const { data, content } = matter(await readFile(path.join(dir, file), 'utf8'));
    const url = typeof data.url === 'string' ? data.url.trim() : '';
    if (url) byUrl.set(normalizeUrl(url), content.trim());
  }
  return byUrl;
}

/** Trailing-slash and case differences should not lose a match. */
function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase();
}

function parseBriefSources(
  markdown: string,
  pageText: Map<string, string>,
): ResearchSourceDto[] {
  const section = markdown.split(/^##\s+Sources\s*$/m)[1];
  if (!section) return [];

  const sources: ResearchSourceDto[] = [];
  for (const line of section.split('\n')) {
    const trimmed = line.trim();
    const m = SOURCE_LINE.exec(trimmed);
    if (!m?.groups) {
      // A line that looks like a source but does not parse is the failure mode
      // worth shouting about. Dropping it silently is how a brief loses half its
      // sources and then fails the three-source floor for no visible reason, or
      // worse, imports with two and takes the grounding gate down with it.
      if (/\[S\d+\]/.test(trimmed)) {
        console.warn(
          `  ! unparsed source line, dropped: ${trimmed.slice(0, 100)}\n` +
            '    expected: - [S1] "Title" — Publisher — Tier 1 — https://url — accessed YYYY-MM-DD',
        );
      }
      continue;
    }
    const url = m.groups.url.trim();
    sources.push({
      title: m.groups.title.trim(),
      url,
      publisher: m.groups.publisher.trim(),
      tier: Number(m.groups.tier) as 1 | 2 | 3,
      accessedAt: m.groups.accessed,
      rawContent: pageText.get(normalizeUrl(url)) ?? '',
    });
  }
  return sources;
}

function parseBriefTopic(markdown: string, slug: string): string {
  const heading = /^#\s+Research Brief:\s*(.+)$/m.exec(markdown);
  return heading ? heading[1].trim() : slug;
}

async function main() {
  const logger = new Logger('import-content');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const articles = app.get(ArticlesService);
  const research = app.get(ResearchService);
  const prisma = app.get(PrismaService);

  let imported = 0;
  let skipped = 0;
  const failures: { file: string; errors: string[] }[] = [];

  // ---- Research briefs first, so articles can be linked to them ----
  const briefDir = path.join(CONTENT_DIR, 'research');
  const briefIdBySlug = new Map<string, string>();
  /** Brief id -> whether any of its sources carries retained page text. */
  const briefHasText = new Map<string, boolean>();

  if (existsSync(briefDir)) {
    for (const file of (await readdir(briefDir)).filter((f) => f.endsWith('.md'))) {
      const slug = file.replace(/\.md$/, '');
      const existing = await prisma.researchBrief.findUnique({ where: { slug } });
      if (existing && !force) {
        briefIdBySlug.set(slug, existing.id);
        // Already-imported briefs still need their grounding capability known,
        // or an article linked to one would import unenforced.
        const stored = await prisma.researchSource.count({
          where: { briefId: existing.id, NOT: { rawContent: '' } },
        });
        briefHasText.set(existing.id, stored > 0);
        skipped++;
        continue;
      }

      const markdown = await readFile(path.join(briefDir, file), 'utf8');
      const pageText = await loadSidecar(briefDir, slug);
      const sources = parseBriefSources(markdown, pageText);
      const grounded = sources.filter((s) => (s.rawContent ?? '').length > 0).length;

      if (sources.length < 3) {
        failures.push({
          file: `research/${file}`,
          errors: [
            `parsed ${sources.length} source(s) from the "## Sources" section, minimum 3. ` +
              'Check the line format matches the research skill template.',
          ],
        });
        continue;
      }

      const dto: SaveBriefDto = {
        slug,
        topic: parseBriefTopic(markdown, slug),
        researchedAt: /^\*\*Researched:\*\*\s*(\d{4}-\d{2}-\d{2})/m.exec(markdown)?.[1],
        status: /^\*\*Status:\*\*\s*needs-follow-up/m.test(markdown)
          ? 'needs-follow-up'
          : 'ready',
        markdown,
        sources,
      };

      try {
        const saved = await research.save(dto);
        briefIdBySlug.set(slug, saved.id);
        briefHasText.set(saved.id, grounded > 0);
        console.log(
          `brief  ${slug}  ${sources.length} source(s), ${grounded} with page text` +
            (grounded === 0
              ? '  ⚠ no sidecar — grounding cannot verify anything for this brief'
              : ''),
        );
        imported++;
      } catch (error) {
        failures.push({
          file: `research/${file}`,
          errors: [errorDetail(error)],
        });
      }
    }
  }

  // ---- Articles ----
  const articleDir = path.join(CONTENT_DIR, 'articles');

  if (existsSync(articleDir)) {
    for (const file of (await readdir(articleDir)).filter((f) => f.endsWith('.md'))) {
      const slug = file.replace(/\.md$/, '');
      const existing = await prisma.article.findUnique({ where: { slug } });
      if (existing && !force) {
        skipped++;
        continue;
      }

      const raw = await readFile(path.join(articleDir, file), 'utf8');
      const { data, content } = matter(raw);

      if (data.slug && data.slug !== slug) {
        failures.push({
          file: `articles/${file}`,
          errors: [`slug "${data.slug}" does not match filename "${slug}"`],
        });
        continue;
      }

      // Link to a brief covering the same topic, if one imported. Matched on the
      // article slug's keywords appearing in the brief slug — imprecise, but the
      // alternative is leaving every imported article ungrounded.
      const briefId = [...briefIdBySlug.entries()].find(([briefSlug]) => {
        const briefWords = briefSlug.replace(/^\d{4}-\d{2}-\d{2}-/, '').split('-');
        const articleWords = slug.split('-');
        return briefWords.filter((w) => articleWords.includes(w)).length >= 2;
      })?.[1];

      const dto: SaveArticleDto = {
        title: data.title,
        headline: data.headline,
        slug,
        description: data.description,
        primaryKeyword: data.primaryKeyword,
        secondaryKeywords: data.secondaryKeywords ?? [],
        category: data.category,
        tags: data.tags ?? [],
        author: data.author ?? { name: 'Unknown' },
        publishedAt: toDateString(data.publishedAt),
        updatedAt: toDateString(data.updatedAt),
        status: data.status,
        heroImage: data.heroImage,
        cves: data.cves ?? [],
        sources: (data.sources ?? []).map(
          (s: Record<string, unknown>) => ({
            ...s,
            accessedAt: toDateString(s.accessedAt),
          }),
        ),
        canonical: data.canonical ?? '',
        body: content,
        briefId,
      };

      // Enforce grounding only when the linked brief actually has page text to
      // check against. A brief imported without a sidecar would otherwise fail
      // every CVE against an empty corpus — a gap in the research, reported as
      // if it were an error in the writing.
      const linkedHasText = briefId ? briefHasText.get(briefId) === true : false;

      try {
        const result = await articles.save(dto, { enforceGrounding: linkedHasText });
        console.log(
          `article ${slug}  ${result.seo.stats.wordCount}w  SEO ${result.seo.score}/${result.seo.max}` +
            `${briefId ? '  → brief' : '  (no brief)'}` +
            `${result.editorial.clean ? '' : `  ⚠ ${result.editorial.hits.length} editorial hit(s)`}`,
        );
        imported++;
      } catch (error) {
        failures.push({ file: `articles/${file}`, errors: extractErrors(error) });
      }
    }
  }

  await app.close();

  console.log(
    `\n  ${imported} imported, ${skipped} already present${force ? '' : ' (use --force to overwrite)'}, ${failures.length} failed\n`,
  );

  for (const failure of failures) {
    console.error(`  ✗ ${failure.file}`);
    for (const e of failure.errors) console.error(`      ${e}`);
  }

  if (failures.length) process.exit(1);
}

function extractErrors(error: unknown): string[] {
  const response = (error as { response?: { errors?: string[]; message?: string } })
    ?.response;
  if (response?.errors?.length) return response.errors;
  return [errorDetail(error)];
}

function errorDetail(error: unknown): string {
  const response = (error as { response?: { message?: string } })?.response;
  return response?.message ?? (error as Error)?.message ?? String(error);
}

void main();
