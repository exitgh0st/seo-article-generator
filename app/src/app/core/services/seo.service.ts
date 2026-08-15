import { Injectable, inject, DOCUMENT } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { Article } from '../models/article.model';
import { SITE } from '../site.config';

const JSON_LD_ID = 'seo-jsonld';

export interface PageSeo {
  title: string;
  description: string;
  path: string;
  type?: 'website' | 'article';
  image?: string;
  noIndex?: boolean;
}

/**
 * Sets metadata for the current route. Call from a route resolver or the
 * component constructor so tags are present in the server-rendered HTML —
 * setting them in ngAfterViewInit is too late for a crawler.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly doc = inject(DOCUMENT);

  setPage(seo: PageSeo): void {
    const url = this.absolute(seo.path);
    const image = seo.image ? this.absolute(seo.image) : undefined;

    this.title.setTitle(seo.title);
    this.tag('name', 'description', seo.description);
    this.setCanonical(url);

    this.tag('property', 'og:title', seo.title);
    this.tag('property', 'og:description', seo.description);
    this.tag('property', 'og:url', url);
    this.tag('property', 'og:type', seo.type ?? 'website');
    this.tag('property', 'og:site_name', SITE.name);
    this.tag('property', 'og:locale', SITE.locale);

    this.tag('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
    this.tag('name', 'twitter:title', seo.title);
    this.tag('name', 'twitter:description', seo.description);
    this.tag('name', 'twitter:site', SITE.twitter);

    if (image) {
      this.tag('property', 'og:image', image);
      this.tag('name', 'twitter:image', image);
    } else {
      this.meta.removeTag("property='og:image'");
      this.meta.removeTag("name='twitter:image'");
    }

    if (seo.noIndex) this.tag('name', 'robots', 'noindex, nofollow');
    else this.meta.removeTag("name='robots'");

    this.clearJsonLd();
  }

  setArticle(article: Article): void {
    const path = `/article/${article.slug}`;

    this.setPage({
      title: article.title,
      description: article.description,
      path,
      type: 'article',
      image: article.heroImage?.src,
      // Anything not yet published must never be indexed.
      noIndex: article.status !== 'published',
    });

    this.tag('property', 'article:published_time', article.publishedAt);
    this.tag('property', 'article:modified_time', article.updatedAt);
    this.tag('property', 'article:section', article.category);
    this.tag('name', 'author', article.author.name);

    if (article.canonical) this.setCanonical(article.canonical);

    this.setJsonLd({
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      headline: article.title,
      description: article.description,
      datePublished: article.publishedAt,
      dateModified: article.updatedAt,
      articleSection: article.category,
      keywords: [article.primaryKeyword, ...article.secondaryKeywords].join(', '),
      wordCount: article.wordCount,
      inLanguage: 'en',
      mainEntityOfPage: { '@type': 'WebPage', '@id': this.absolute(article.canonical || path) },
      author: {
        '@type': 'Person',
        name: article.author.name,
        ...(article.author.title ? { jobTitle: article.author.title } : {}),
      },
      publisher: {
        '@type': 'Organization',
        name: SITE.publisher,
        url: SITE.origin,
      },
      ...(article.heroImage?.src ? { image: [this.absolute(article.heroImage.src)] } : {}),
      // Cite the primary sources. Search engines read this as provenance.
      citation: article.sources.map((s) => ({
        '@type': 'CreativeWork',
        name: s.title,
        url: s.url,
        publisher: { '@type': 'Organization', name: s.publisher },
      })),
    });
  }

  private absolute(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    return `${SITE.origin}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
  }

  private tag(attr: 'name' | 'property', key: string, content: string): void {
    this.meta.updateTag({ [attr]: key, content }, `${attr}='${key}'`);
  }

  private setCanonical(url: string): void {
    const head = this.doc.head;
    let link = head.querySelector<HTMLLinkElement>("link[rel='canonical']");
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', 'canonical');
      head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  private setJsonLd(data: unknown): void {
    this.clearJsonLd();
    const script = this.doc.createElement('script');
    script.type = 'application/ld+json';
    script.id = JSON_LD_ID;
    script.textContent = JSON.stringify(data);
    this.doc.head.appendChild(script);
  }

  private clearJsonLd(): void {
    this.doc.getElementById(JSON_LD_ID)?.remove();
  }
}
