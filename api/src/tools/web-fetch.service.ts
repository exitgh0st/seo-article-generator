import { Injectable, Logger } from '@nestjs/common';
import { JSDOM, VirtualConsole } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { FETCH_LIMITS } from '../common/constants/limits';
import { assertPublicUrl, BlockedAddressError } from './ssrf-guard';
import { isVendorResearch, publisherFor, tierFor, type SourceTier } from './source-tiers';

export interface FetchedPage {
  url: string;
  /** The final URL after redirects, which is what should be cited. */
  finalUrl: string;
  title: string;
  publisher: string;
  tier: SourceTier;
  vendorResearch: boolean;
  /** Extracted article text as markdown. */
  markdown: string;
  /** Byline and publication date, when the page declares them. */
  byline?: string;
  publishedTime?: string;
  truncated: boolean;
}

export class FetchFailedError extends Error {
  constructor(
    readonly url: string,
    readonly reason: string,
  ) {
    super(`Could not fetch ${url}: ${reason}`);
    this.name = 'FetchFailedError';
  }
}

const MAX_REDIRECTS = 5;
const MAX_BYTES = 5_000_000;

/**
 * Fetches a page and reduces it to article markdown.
 *
 * Security sites are heavy — nav, cookie banners, related-article rails, vendor
 * CTAs. Handing all of that to the model wastes context and, worse, gives it
 * plausible-looking text from a sidebar to cite. Readability keeps the article
 * body; Turndown preserves the link and heading structure that carries the
 * advisory's meaning.
 */
@Injectable()
export class WebFetchService {
  private readonly logger = new Logger(WebFetchService.name);
  private readonly turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });

  async fetchPage(rawUrl: string): Promise<FetchedPage> {
    const { html, finalUrl } = await this.retrieve(rawUrl);

    // JSDOM logs every CSS parse error on a real-world page. Silence it — the
    // stylesheet is irrelevant to text extraction.
    const virtualConsole = new VirtualConsole();
    const dom = new JSDOM(html, { url: finalUrl, virtualConsole });

    const reader = new Readability(dom.window.document);
    const parsed = reader.parse();

    // Readability returns null on pages it cannot identify as an article — many
    // vendor advisories are tables and definition lists rather than prose. Fall
    // back to the body rather than reporting the fetch as a failure.
    const contentHtml =
      parsed?.content ?? dom.window.document.body?.innerHTML ?? '';

    if (!contentHtml.trim()) {
      throw new FetchFailedError(rawUrl, 'page had no extractable content');
    }

    const full = this.turndown.turndown(contentHtml).replace(/\n{3,}/g, '\n\n').trim();
    const truncated = full.length > FETCH_LIMITS.maxFetchChars;
    const markdown = truncated
      ? `${full.slice(0, FETCH_LIMITS.maxFetchChars)}\n\n[truncated at ${FETCH_LIMITS.maxFetchChars} characters]`
      : full;

    const title =
      parsed?.title?.trim() ||
      dom.window.document.title?.trim() ||
      finalUrl;

    dom.window.close();

    const page: FetchedPage = {
      url: rawUrl,
      finalUrl,
      title,
      publisher: parsed?.siteName?.trim() || publisherFor(finalUrl),
      tier: tierFor(finalUrl),
      vendorResearch: isVendorResearch(finalUrl),
      markdown,
      byline: parsed?.byline?.trim() || undefined,
      publishedTime: parsed?.publishedTime ?? undefined,
      truncated,
    };

    this.logger.log(
      `fetch ${finalUrl} → T${page.tier}, ${markdown.length} chars${truncated ? ' (truncated)' : ''}`,
    );

    return page;
  }

  /**
   * Follows redirects manually so every hop is revalidated. `redirect: 'follow'`
   * would let a permitted host bounce the request to a private address.
   */
  private async retrieve(
    rawUrl: string,
  ): Promise<{ html: string; finalUrl: string }> {
    let current = rawUrl;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const url = await assertPublicUrl(current);

      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        FETCH_LIMITS.fetchTimeoutMs,
      );

      let response: Response;
      try {
        response = await fetch(url, {
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            // Some advisory sites 403 an obviously scripted client. Identify
            // honestly rather than impersonating a browser.
            'User-Agent':
              'CyberBriefResearchBot/1.0 (+security research; contact via site)',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          throw new FetchFailedError(
            current,
            `timed out after ${FETCH_LIMITS.fetchTimeoutMs}ms`,
          );
        }
        throw new FetchFailedError(current, (error as Error).message);
      } finally {
        clearTimeout(timer);
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new FetchFailedError(current, `${response.status} with no Location header`);
        }
        current = new URL(location, url).toString();
        continue;
      }

      if (!response.ok) {
        throw new FetchFailedError(
          current,
          `HTTP ${response.status}${response.status === 403 ? ' (the site blocks automated clients)' : ''}`,
        );
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
        throw new FetchFailedError(
          current,
          `unsupported content type "${contentType.split(';')[0]}"`,
        );
      }

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_BYTES) {
        throw new FetchFailedError(
          current,
          `response is ${Math.round(buffer.byteLength / 1024)}kB, over the ${MAX_BYTES / 1024 / 1024}MB limit`,
        );
      }

      return {
        html: new TextDecoder('utf-8').decode(buffer),
        finalUrl: url.toString(),
      };
    }

    throw new FetchFailedError(rawUrl, `more than ${MAX_REDIRECTS} redirects`);
  }

  /**
   * HEAD/GET each URL to confirm it still resolves. Backs the publish preflight —
   * .claude/skills/publish/SKILL.md refuses to publish when a source URL is
   * unreachable, and this is that check as code.
   */
  async verifyUrls(
    urls: string[],
  ): Promise<{ url: string; ok: boolean; status: number | null; detail?: string }[]> {
    return Promise.all(
      urls.map(async (rawUrl) => {
        try {
          const url = await assertPublicUrl(rawUrl);
          const controller = new AbortController();
          const timer = setTimeout(
            () => controller.abort(),
            FETCH_LIMITS.fetchTimeoutMs,
          );
          try {
            // Some sites reject HEAD outright, so a failed HEAD is retried as a
            // ranged GET before the URL is called dead.
            let response = await fetch(url, {
              method: 'HEAD',
              redirect: 'follow',
              signal: controller.signal,
              headers: { 'User-Agent': 'CyberBriefResearchBot/1.0' },
            });
            if (!response.ok) {
              response = await fetch(url, {
                method: 'GET',
                redirect: 'follow',
                signal: controller.signal,
                headers: {
                  'User-Agent': 'CyberBriefResearchBot/1.0',
                  Range: 'bytes=0-2047',
                },
              });
            }
            return {
              url: rawUrl,
              ok: response.ok || response.status === 206,
              status: response.status,
            };
          } finally {
            clearTimeout(timer);
          }
        } catch (error) {
          return {
            url: rawUrl,
            ok: false,
            status: null,
            detail:
              error instanceof BlockedAddressError
                ? error.reason
                : (error as Error).message,
          };
        }
      }),
    );
  }
}
