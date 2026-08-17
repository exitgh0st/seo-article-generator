import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ArticlesService } from './articles.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { MarkdownService } from '../seo/markdown.service';
import type { ArticleValidationService } from '../seo/article-validation.service';
import type { GroundingService } from '../research/grounding.service';

/**
 * Deleting has to take the exported markdown with it.
 *
 * The file is an input to `npm run import`, so a delete that stops at the
 * database is undone the next time content is loaded — the article reappears
 * with no trace of what put it back. That is the case worth a test, along with
 * its mirror: a draft was never exported, and ENOENT must not turn a successful
 * delete into a failure.
 */

async function serviceIn(contentDir: string, row: unknown = { slug: 'a-slug' }) {
  const prisma = {
    article: {
      findUnique: jest.fn().mockResolvedValue(row),
      delete: jest.fn().mockResolvedValue(row),
    },
  } as unknown as PrismaService;

  const config = {
    get: jest.fn().mockReturnValue(contentDir),
  } as unknown as ConfigService<never, true>;

  const svc = new ArticlesService(
    prisma,
    {} as MarkdownService,
    {} as ArticleValidationService,
    {} as GroundingService,
    config,
  );

  return { svc, prisma };
}

describe('ArticlesService.remove', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'articles-remove-'));
    await mkdir(path.join(dir, 'articles'), { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('deletes the row and the markdown exported for it', async () => {
    const file = path.join(dir, 'articles', 'a-slug.md');
    await writeFile(file, '---\ntitle: "x"\n---\n\n## Body\n', 'utf8');

    const { svc, prisma } = await serviceIn(dir);
    await svc.remove('a-slug');

    expect(prisma.article.delete).toHaveBeenCalledWith({ where: { slug: 'a-slug' } });
    expect(existsSync(file)).toBe(false);
  });

  it('succeeds on a draft that was never exported', async () => {
    const { svc, prisma } = await serviceIn(dir);

    await expect(svc.remove('a-slug')).resolves.toBeUndefined();
    expect(prisma.article.delete).toHaveBeenCalled();
  });

  it('leaves other articles alone', async () => {
    await writeFile(path.join(dir, 'articles', 'a-slug.md'), 'x', 'utf8');
    await writeFile(path.join(dir, 'articles', 'another-slug.md'), 'y', 'utf8');

    const { svc } = await serviceIn(dir);
    await svc.remove('a-slug');

    expect(await readdir(path.join(dir, 'articles'))).toEqual(['another-slug.md']);
  });

  it('does not touch the filesystem when the article does not exist', async () => {
    const file = path.join(dir, 'articles', 'a-slug.md');
    await writeFile(file, 'x', 'utf8');

    const { svc, prisma } = await serviceIn(dir, null);

    await expect(svc.remove('a-slug')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.article.delete).not.toHaveBeenCalled();
    expect(existsSync(file)).toBe(true);
  });
});
