import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SiteConfigService } from './site-config.service';

/**
 * sitemap.xml, rss.xml and robots.txt.
 *
 * scripts/build-content-index.mjs used to write these into app/public/ at build
 * time. With articles in a database that changes without a rebuild, a static file
 * goes stale the moment something is published — so they are generated per
 * request here instead. The output format is unchanged.
 */
@Injectable()
export class FeedsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly site: SiteConfigService,
  ) {}

  private published() {
    return this.prisma.article.findMany({
      where: { status: 'published' },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        slug: true,
        title: true,
        description: true,
        category: true,
        tags: true,
        authorName: true,
        publishedAt: true,
        updatedAt: true,
      },
    });
  }

  async sitemap(): Promise<string> {
    const articles = await this.published();
    const categories = [...new Set(articles.map((a) => a.category))];
    const tags = [...new Set(articles.flatMap((a) => a.tags))];
    const latest = articles[0]?.updatedAt ?? new Date().toISOString().slice(0, 10);

    const entry = (loc: string, lastmod: string, priority: string) =>
      `  <url>\n    <loc>${xmlEscape(this.site.url(loc))}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${priority}</priority>\n  </url>`;

    const entries = [
      entry('/', latest, '1.0'),
      ...articles.map((a) => entry(`/article/${a.slug}`, a.updatedAt, '0.8')),
      ...categories.map((c) => entry(`/category/${c}`, latest, '0.6')),
      ...tags.map((t) => entry(`/tag/${encodeURIComponent(t)}`, latest, '0.4')),
    ];

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
  }

  async rss(): Promise<string> {
    const site = this.site.get();
    const articles = (await this.published()).slice(0, 50);

    const items = articles
      .map((a) => {
        const link = this.site.url(`/article/${a.slug}`);
        return [
          '    <item>',
          `      <title>${xmlEscape(a.title)}</title>`,
          `      <link>${xmlEscape(link)}</link>`,
          `      <guid isPermaLink="true">${xmlEscape(link)}</guid>`,
          `      <description>${xmlEscape(a.description)}</description>`,
          `      <category>${xmlEscape(a.category)}</category>`,
          `      <author>${xmlEscape(a.authorName)}</author>`,
          `      <pubDate>${new Date(`${a.publishedAt}T00:00:00Z`).toUTCString()}</pubDate>`,
          '    </item>',
        ].join('\n');
      })
      .join('\n');

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
      '  <channel>',
      `    <title>${xmlEscape(site.name)}</title>`,
      `    <link>${xmlEscape(site.origin)}</link>`,
      `    <description>${xmlEscape(site.description)}</description>`,
      `    <language>${xmlEscape(site.language)}</language>`,
      `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
      `    <atom:link href="${xmlEscape(this.site.url('/rss.xml'))}" rel="self" type="application/rss+xml"/>`,
      items,
      '  </channel>',
      '</rss>',
      '',
    ].join('\n');
  }

  robots(): string {
    return [
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin',
      '',
      `Sitemap: ${this.site.url('/sitemap.xml')}`,
      '',
    ].join('\n');
  }
}

const xmlEscape = (s: string) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
