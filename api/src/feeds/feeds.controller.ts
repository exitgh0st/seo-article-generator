import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { FeedsService } from './feeds.service';
import { Public } from '../auth/public.decorator';

/**
 * Crawler-facing files. These sit at the site root rather than under /api — see
 * the `exclude` list on setGlobalPrefix in main.ts.
 */
@ApiExcludeController()
@Public()
@Controller()
export class FeedsController {
  constructor(private readonly feeds: FeedsService) {}

  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  sitemap() {
    return this.feeds.sitemap();
  }

  @Get('rss.xml')
  @Header('Content-Type', 'application/rss+xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  rss() {
    return this.feeds.rss();
  }

  @Get('robots.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=86400')
  robots() {
    return this.feeds.robots();
  }
}
