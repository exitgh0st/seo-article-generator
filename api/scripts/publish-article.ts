/**
 * Runs the publish preflight and, if it passes, publishes an article.
 *
 *   npm run publish -- <slug>
 *   npm run publish -- <slug> --check    # preflight only, change nothing
 *
 * The same gates the admin UI's publish screen runs, from a terminal. Useful for
 * scripting a batch, and for publishing when the app is not running.
 *
 * It goes through PublishService rather than flipping the status column, because
 * the gates are the point: status must be `review`, the SEO rubric must have no
 * blocking row, the score must clear the floor, there must be at least three
 * sources, every source URL is re-checked live, and no CVE or indicator may be
 * missing from the retained source text. A status update that skipped those would
 * publish exactly the article the pipeline exists to catch.
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PublishService } from '../src/publish/publish.service';

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const slug = args.find((a) => !a.startsWith('--'));

  if (!slug) {
    console.error('Usage: npm run publish -- <slug> [--check]');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const publish = app.get(PublishService);

  try {
    const pre = await publish.preflight(slug);

    console.log(`\n  Preflight — ${slug}\n`);
    for (const check of pre.sourceChecks ?? []) {
      const mark = check.ok ? 'ok  ' : 'DEAD';
      console.log(`    ${mark} ${check.url}`);
    }
    for (const w of pre.warnings) console.log(`    ·  ${w}`);
    for (const b of pre.blockers) console.log(`    ✗  ${b}`);

    if (!pre.ok) {
      console.error(`\n  Not publishable — ${pre.blockers.length} blocker(s) above.\n`);
      process.exitCode = 1;
      return;
    }

    if (checkOnly) {
      console.log('\n  Preflight passes. Re-run without --check to publish.\n');
      return;
    }

    const result = await publish.publish(slug);
    console.log(`\n  Published ${slug}`);
    if (result.exportedTo) console.log(`  Exported  ${result.exportedTo}`);
    if (result.exportError) {
      console.log(
        `  ⚠ Markdown export failed: ${result.exportError}\n` +
          '    The database is the source of truth, so the article is live —\n' +
          '    but the git-reviewable copy was not written.',
      );
    }
    console.log('');
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  const detail = (error as { response?: { message?: string; blockers?: string[] } })?.response;
  if (detail?.blockers?.length) {
    console.error(`\n  ${detail.message}`);
    for (const b of detail.blockers) console.error(`    ✗ ${b}`);
    console.error('');
  } else {
    console.error(detail?.message ?? (error as Error).message);
  }
  process.exit(1);
});
