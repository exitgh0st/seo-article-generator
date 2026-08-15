import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ArticlesService } from './articles.service';
import { SaveArticleDto } from './dto/save-article.dto';
import { ListArticlesDto } from './dto/list-articles.dto';
import { PatchArticleDto, SetStatusDto } from './dto/patch-article.dto';
import { Public } from '../auth/public.decorator';

/**
 * Read routes are `@Public()` but status-scoped: an unauthenticated caller only
 * ever sees `published`. This replaces the old arrangement where drafts were kept
 * off the public site by client-side render mode and a robots.txt Disallow, which
 * protected nothing.
 */
@ApiTags('Articles')
@Controller('articles')
export class ArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'List articles. Anonymous callers receive published only.',
  })
  list(@Query() query: ListArticlesDto, @Req() req: Request) {
    return this.articles.list(query, isAuthenticated(req));
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'One article, including rendered HTML and sources.' })
  findOne(@Param('slug') slug: string, @Req() req: Request) {
    return this.articles.findBySlug(slug, isAuthenticated(req));
  }

  @ApiBearerAuth()
  @Post()
  @ApiOperation({ summary: 'Create or replace an article draft.' })
  save(@Body() dto: SaveArticleDto) {
    return this.articles.save(dto);
  }

  @ApiBearerAuth()
  @Patch(':slug')
  @ApiOperation({ summary: 'Apply a surgical edit to an existing article.' })
  patch(@Param('slug') slug: string, @Body() dto: PatchArticleDto) {
    return this.articles.patch(slug, dto);
  }

  @ApiBearerAuth()
  @Post(':slug/status')
  @ApiOperation({
    summary: 'Move between draft and review. Publishing is a separate route.',
  })
  setStatus(@Param('slug') slug: string, @Body() dto: SetStatusDto) {
    return this.articles.setStatus(slug, dto.status);
  }

  @ApiBearerAuth()
  @Post(':slug/score')
  @ApiOperation({
    summary: 'Rescore against the rubric and rerun the editorial scan.',
  })
  rescore(@Param('slug') slug: string) {
    return this.articles.rescore(slug);
  }

  @ApiBearerAuth()
  @Delete(':slug')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an article.' })
  remove(@Param('slug') slug: string) {
    return this.articles.remove(slug);
  }
}

/**
 * The route is `@Public()`, so the guard never populated `request.user`. Passport
 * is not run at all here — presence of a verified user is decided by the guard,
 * and on a public route there is none. Authenticated listing therefore goes
 * through the same routes with a token, and the guard populates `user` only when
 * the route is not public.
 *
 * Because `@Public()` skips verification entirely, an authenticated *view* of a
 * public route needs its own check: see ArticlesModule, which registers the
 * OptionalJwtMiddleware for exactly these two routes.
 */
function isAuthenticated(req: Request): boolean {
  return Boolean((req as Request & { user?: unknown }).user);
}
