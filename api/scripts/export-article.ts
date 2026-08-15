/**
 * Writes an article from Postgres back out to content/articles/<slug>.md.
 *
 *   npm run article:export -- <slug>
 *   npm run article:export -- <slug> --force   # overwrite an existing file
 *   npm run article:export -- --list
 *
 * PublishService already exports on publish, so this covers the case it does not:
 * a draft or in-review article that needs to be read, diffed or scored outside the
 * app. Same `toMarkdown` serializer the publish path uses, so a file produced here
 * and a file produced by publishing are byte-identical for the same row — no second
 * formatting path to drift.
 */

import 'dotenv/config';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { toMarkdown } from '../src/publish/markdown-export';

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
    console.error('Usage: npm run article:export -- <slug> [--force]');
    console.error('       npm run article:export -- --list');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const prisma = app.get(PrismaService);

  try {
    if (wantsList) {
      const rows = await prisma.article.findMany({
        orderBy: { updatedAt: 'desc' },
        select: { slug: true, status: true, seoScore: true, title: true },
      });
      for (const row of rows) {
        console.log(
          `  ${row.slug.padEnd(46)} [${row.status}] ${row.seoScore ?? '-'}  ${row.title.slice(0, 50)}`,
        );
      }
      return;
    }

    const row = await prisma.article.findUnique({ where: { slug: slug! } });
    if (!row) {
      console.error(`✗ No article with slug "${slug}"`);
      process.exitCode = 1;
      return;
    }

    const dir = path.join(CONTENT_DIR, 'articles');
    const file = path.join(dir, `${row.slug}.md`);
    if (existsSync(file) && !force) {
      console.error(`✗ ${file} already exists. Pass --force to overwrite.`);
      process.exitCode = 1;
      return;
    }

    await mkdir(dir, { recursive: true });
    await writeFile(file, toMarkdown(row), 'utf8');
    console.log(
      `  wrote ${path.relative(process.cwd(), file)}  [${row.status}]  ${row.seoScore ?? '-'}/${row.seoMax ?? '-'}`,
    );
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error((error as Error).stack ?? String(error));
  process.exit(1);
});
