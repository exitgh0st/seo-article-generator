import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  tierFor,
  publisherFor,
  isVendorResearch,
  TIER_1_DOMAINS,
  type SourceTier,
} from './source-tiers';
import type { Env } from '../config/env.schema';

/**
 * Web search for the research stage, via Tavily.
 *
 * Results are a *ranking to choose from*, not evidence. Snippets are capped hard
 * and the full text always comes from WebFetchService afterwards. An earlier
 * version returned whole pages here and the research step simply wrote its brief
 * from the snippets, which left the grounding gate comparing an article against
 * summaries rather than sources — the check passed while verifying nothing.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publisher: string;
  tier: SourceTier;
  /** docs/sources.md requires the vendor's interest be named in-text. */
  vendorResearch: boolean;
  publishedDate: string | null;
}

const MAX_RESULTS = 8;
const MAX_SNIPPET_CHARS = 1_200;

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);
  private readonly apiKey: string;

  constructor(config: ConfigService<Env, true>) {
    this.apiKey = config.getOrThrow<string>('TAVILY_API_KEY');
  }

  /**
   * @param days Restrict to the last N days. Security stories go stale in hours,
   *   and an undated ranking will happily return last year's advisory first.
   */
  async search(
    query: string,
    options: {
      days?: number;
      includeDomains?: string[];
      maxResults?: number;
      /** Drop the news ranking. Required to surface advisories and CVE records. */
      general?: boolean;
    } = {},
  ): Promise<SearchResult[]> {
    const body = {
      query,
      search_depth: 'advanced',
      topic: options.general ? 'general' : 'news',
      max_results: Math.min(options.maxResults ?? MAX_RESULTS, MAX_RESULTS),
      include_raw_content: false,
      // `days` only applies to the news topic; sending it with general narrows
      // nothing and can drop an advisory published before the story broke.
      ...(options.days && !options.general ? { days: options.days } : {}),
      ...(options.includeDomains?.length
        ? { include_domains: options.includeDomains }
        : {}),
    };

    let response: Response;
    try {
      response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      // Surfaced as a `provider` failure by the caller: worth retrying, unlike a
      // refusal or a bad query.
      throw new ServiceUnavailableException(
        `Search is unreachable: ${(error as Error).message}`,
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new ServiceUnavailableException(
        `Search failed with ${response.status}. ${detail.slice(0, 200)}`,
      );
    }

    const payload = (await response.json()) as {
      results?: {
        title?: string;
        url?: string;
        content?: string;
        published_date?: string;
      }[];
    };

    const results = (payload.results ?? [])
      .filter((r): r is { url: string } & typeof r => Boolean(r.url))
      .map((r) => ({
        title: r.title?.trim() || r.url,
        url: r.url,
        snippet: (r.content ?? '').slice(0, MAX_SNIPPET_CHARS),
        publisher: publisherFor(r.url),
        tier: tierFor(r.url),
        vendorResearch: isVendorResearch(r.url),
        publishedDate: r.published_date ?? null,
      }));

    this.logger.log(
      `search "${query.slice(0, 60)}" -> ${results.length} result(s), ` +
        `${results.filter((r) => r.tier === 1).length} Tier 1`,
    );

    return results;
  }

  /**
   * Search primary sources only.
   *
   * `topic: 'news'` ranks outlets and effectively hides advisories — measured on
   * one topic, three news queries returned twelve results and not one Tier 1,
   * because the NVD record and the CISA alert are not news. This constrains the
   * search to the domains docs/sources.md calls primary and drops the news
   * ranking, which is what surfaces them.
   *
   * Tavily caps `include_domains`, so this sends the advisory and government
   * domains most likely to carry a specific CVE rather than the whole list.
   */
  async searchPrimary(topic: string): Promise<SearchResult[]> {
    // The old filter was a hand-written regex naming specific vendors
    // (`jetbrains|progress|…`), which meant it only ever surfaced advisories for
    // topics someone had already tuned it for, and silently excluded every
    // domain added to TIER_1_DOMAINS afterwards — including the government
    // mirrors that carry joint advisories.
    //
    // Government and standards bodies first, because those carry the advisory
    // itself; then vendor PSIRT and research. Everything comes from
    // TIER_1_DOMAINS, so adding a domain there now reaches this search too.
    const isGovernment = (d: string) =>
      /\.gov$|\.gov\.|cve\.org|cert|ncsc|enisa|europa\.eu/i.test(d);

    const priority = [
      ...TIER_1_DOMAINS.filter(isGovernment),
      ...TIER_1_DOMAINS.filter((d) => !isGovernment(d)),
    ].slice(0, 20);

    const results = await this.search(topic, {
      includeDomains: priority.length ? priority : undefined,
      maxResults: MAX_RESULTS,
      general: true,
    });

    return results;
  }
}
