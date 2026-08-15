import { Injectable } from '@nestjs/common';
import MarkdownIt from 'markdown-it';
import type { Heading } from './article.types';
import { extractHeadings } from './seo-score';

/**
 * Renders article markdown to HTML with the same configuration as
 * scripts/build-content-index.mjs. Both paths must produce byte-identical output
 * — an article imported from disk and one written by the pipeline should be
 * indistinguishable once rendered.
 */
@Injectable()
export class MarkdownService {
  private readonly md: MarkdownIt;

  constructor() {
    this.md = new MarkdownIt({ html: true, linkify: true, typographer: true });

    // Open external links in a new tab; leave internal routing alone.
    const defaultLinkOpen =
      this.md.renderer.rules.link_open ??
      ((tokens, i, opts, _env, self) => self.renderToken(tokens, i, opts));
    this.md.renderer.rules.link_open = (tokens, i, opts, env, self) => {
      const href = tokens[i].attrGet('href') || '';
      if (/^https?:\/\//i.test(href)) {
        tokens[i].attrSet('target', '_blank');
        tokens[i].attrSet('rel', 'noopener noreferrer');
      }
      return defaultLinkOpen(tokens, i, opts, env, self);
    };

    // Stable heading ids so the table of contents can anchor.
    this.md.renderer.rules.heading_open = (tokens, i, opts, _env, self) => {
      const inline = tokens[i + 1];
      if (inline?.type === 'inline') {
        tokens[i].attrSet('id', slugifyHeading(inline.content));
      }
      return self.renderToken(tokens, i, opts);
    };
  }

  render(markdown: string): string {
    return this.md.render(markdown);
  }

  /** H2 and H3 only — what the table of contents renders. */
  tableOfContents(markdown: string): Heading[] {
    return extractHeadings(markdown)
      .filter((h) => h.level === 2 || h.level === 3)
      .map((h) => ({ ...h, id: slugifyHeading(h.text) }));
  }
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}
