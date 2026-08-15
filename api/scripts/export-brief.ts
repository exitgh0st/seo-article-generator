/**
 * Writes a research brief from Postgres back out to content/research/<slug>.md.
 *
 *   npm run brief:export -- <slug>
 *   npm run brief:export -- <slug> --force   # overwrite an existing file
 *   npm run brief:export -- --list           # show what is available
 *
 * The mirror of import-content.ts, and the missing half of the round trip: until
 * now markdown only ever travelled disk → database for briefs, and database →
 * disk for published articles. Without this there is no way to hand a brief the
 * API researched to a Claude Code session, because that session reads files.
 *
 * The stored page text deliberately does not come with it. `rawContent` stays in
 * Postgres, where GroundingService can check a later draft's CVE identifiers
 * against it. Writing it to disk would hand the writing model the raw sources —
 * which is exactly what the write phase exists to prevent, and would turn the
 * grounding check into a tautology. What lands on disk is the brief: the frozen,
 * human-readable fact set, and nothing else.
 *
 * The source-text summary printed at the end is the useful part of the output.
 * A brief whose sources total zero stored characters cannot ground anything —
 * that is the CLI-era import case — and the warning says so rather than letting
 * a later check pass vacuously.
 */

import 'dotenv/config';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { ResearchService } from '../src/research/research.service';

const CONTENT_DIR = path.resolve(
  process.cwd(),
  process.env.CONTENT_DIR ?? '../content',
);

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const wantsList = args.includes('--list');
  const slug = args.find((a) => !a.startsWith('--'));

  if (!slug && !wantsList) {
    console.error('Usage: npm run brief:export -- <slug> [--force]');
    console.error('       npm run brief:export -- --list');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const research = app.get(ResearchService);

  try {
    if (wantsList) {
      const briefs = await research.list();
      if (!briefs.length) {
        console.log('No research briefs in the database.');
        return;
      }
      for (const brief of briefs) {
        const tiers = Object.entries(brief.tierCounts)
          .map(([tier, count]) => `T${tier}×${count}`)
          .join(' ');
        console.log(
          `  ${brief.slug}\n      ${brief.topic}\n      ${brief.researchedAt}  ${brief.status}  ${brief.sourceCount} source(s)  ${tiers}`,
        );
      }
      return;
    }

    const brief = await research.findBySlug(slug!);
    const dir = path.join(CONTENT_DIR, 'research');
    const file = path.join(dir, `${brief.slug}.md`);

    if (existsSync(file) && !force) {
      console.error(`✗ ${file} already exists. Pass --force to overwrite.`);
      process.exitCode = 1;
      return;
    }

    await mkdir(dir, { recursive: true });
    await writeFile(file, brief.markdown, 'utf8');

    const stored = brief.sources.reduce((sum, s) => sum + s.contentLength, 0);
    const empty = brief.sources.filter((s) => s.contentLength === 0).length;

    console.log(`\n  wrote ${path.relative(process.cwd(), file)}`);
    console.log(`  topic     ${brief.topic}`);
    console.log(`  status    ${brief.status}  (researched ${brief.researchedAt})`);
    console.log(
      `  sources   ${brief.sourceCount}  ` +
        Object.entries(brief.tierCounts)
          .map(([tier, count]) => `Tier ${tier}×${count}`)
          .join('  '),
    );
    console.log(`  page text ${stored.toLocaleString()} chars stored across sources`);

    if (stored === 0) {
      console.log(
        '\n  ⚠ No stored page text. A draft written from this brief cannot be\n' +
          '    grounded — GroundingService will have nothing to check against.\n' +
          '    Re-run the research phase through the app to populate it.',
      );
    } else if (empty) {
      console.log(
        `\n  ⚠ ${empty} of ${brief.sourceCount} source(s) have no stored text; claims\n` +
          '    resting only on those cannot be verified.',
      );
    }
    console.log('');
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  new Logger('export-brief').error(
    (error as { response?: { message?: string } })?.response?.message ??
      (error as Error).message,
  );
  process.exit(1);
});
