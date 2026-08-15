/**
 * Rewrites existing articles so they do not read as machine-generated.
 *
 *   npm run humanize -- <slug>
 *   npm run humanize -- --all
 *   npm run humanize -- --all --force   # include articles that cannot be verified
 *   npm run humanize -- <slug> --check  # report what would run, change nothing
 *
 * Goes through the same HumanizeService the pipeline's humanize stage uses, so a
 * backfilled article and a freshly generated one get identical treatment.
 *
 * **The default skips articles whose sources carry no retained text.** The
 * grounding check is what makes a prose rewrite safe on this beat — it proves no
 * CVE identifier or indicator moved — and against an empty corpus it cannot
 * prove anything. It does not fail; it passes vacuously. Rewriting an article
 * under those conditions is unverified by construction, so it takes `--force`
 * and a human reading the diff.
 *
 * `publishedAt` is never touched. `updatedAt` moves, and a published article is
 * re-exported to content/articles/ so the git copy matches what is live.
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HumanizeService } from '../src/generation/humanize.service';
import { PublishService } from '../src/publish/publish.service';

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const force = args.includes('--force');
  const checkOnly = args.includes('--check');
  const slug = args.find((a) => !a.startsWith('--'));

  if (!slug && !all) {
    console.error('Usage: npm run humanize -- <slug>|--all [--force] [--check]');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);
  const humanizer = app.get(HumanizeService);
  const publish = app.get(PublishService);

  try {
    const targets = all
      ? (
          await prisma.article.findMany({
            orderBy: { createdAt: 'asc' },
            select: { slug: true },
          })
        ).map((a) => a.slug)
      : [slug!];

    console.log(`\n  ${targets.length} article(s) to consider\n`);

    let done = 0;
    let skipped = 0;
    let failed = 0;

    for (const target of targets) {
      const row = await prisma.article.findUnique({
        where: { slug: target },
        select: { slug: true, status: true },
      });

      if (!row) {
        console.log(`  ✗ ${target} — no such article`);
        failed++;
        continue;
      }

      const verifiable = await humanizer.canVerify(target);

      if (!verifiable && !force) {
        console.log(
          `  · ${target} [${row.status}] — skipped: its sources carry no retained\n` +
            '      text, so a rewrite could not be checked against them. Re-run\n' +
            '      research on the topic, or pass --force and read the diff yourself.',
        );
        skipped++;
        continue;
      }

      if (checkOnly) {
        console.log(
          `  → ${target} [${row.status}] — would run${verifiable ? '' : ' (UNVERIFIED)'}`,
        );
        continue;
      }

      try {
        const result = await humanizer.humanize(target);
        console.log(
          `  ✓ ${target} [${row.status}] — ${result.charsBefore} → ${result.charsAfter} chars, ` +
            `${result.emDashesRemoved} em dash(es) removed, SEO ${result.score}/${result.max}` +
            (verifiable ? '' : '  ⚠ UNVERIFIED — read this diff'),
        );

        // Keep the git copy in step with what is actually live.
        if (row.status === 'published') {
          const exported = await publish.publish(target).catch(() => null);
          if (exported?.exportedTo) {
            console.log(`      re-exported to ${exported.exportedTo}`);
          }
        }

        done++;
      } catch (error) {
        const detail =
          (error as { remedy?: string; message?: string }).remedy ??
          (error as Error).message;
        console.log(`  ✗ ${target} — ${detail}`);
        failed++;
      }
    }

    console.log(
      `\n  ${done} rewritten, ${skipped} skipped, ${failed} failed\n` +
        (skipped && !force
          ? '  Skipped articles need their research re-run, or --force.\n'
          : ''),
    );

    if (failed) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error((error as Error).stack ?? String(error));
  process.exit(1);
});
