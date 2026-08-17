import {
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebSearchService, type SearchResult } from '../tools/web-search.service';
import { extractCves, isNotASource } from '../tools/source-filters';
import type { SourceTier } from '../tools/source-tiers';
import { today } from './prompts.service';

/**
 * Can this topic become an article? Asked before anything is spent on finding out.
 *
 * A run is a commitment: six stages, a minute of searching and fetching, and a
 * DeepSeek bill. Until now the operator learned a topic was hopeless a minute in,
 * when the research stage hit one of its hard gates — and the screen then offered
 * a Retry button that would search the same web and find the same nothing. The
 * common failures are knowable in about three seconds, so they are checked here
 * first and the operator is sent to pick a different story.
 *
 * No model call. Four searches and one database query, which is roughly a tenth
 * of what the suggester costs and two orders of magnitude less than a run.
 *
 * The queries deliberately mirror research.stage.ts exactly. This is a prediction
 * of what that stage will see, and a prediction made from different queries is a
 * prediction of something else.
 *
 * What it cannot predict is the fetch. A page that ranks well can still return a
 * 403, or — as NVD does — a client-rendered shell with no record in it, and only
 * fetching finds that out. That gap is covered from the other side: the research
 * stage's own gates now raise TopicUnworkableError, so a topic that gets past
 * preflight and dies anyway still ends with "start a different topic" rather than
 * a button. Preflight makes the common case fast; it is not a guarantee.
 */

/** A source the operator can click before committing to a run. */
export interface PreflightSource {
  title: string;
  url: string;
  publisher: string;
  tier: SourceTier;
}

export type PreflightVerdict = 'ready' | 'thin' | 'covered' | 'unsourceable';

export interface TopicPreflight {
  verdict: PreflightVerdict;
  /** Whether the operator should be stopped rather than warned. */
  blocking: boolean;
  /** One sentence, plain language. The whole verdict for someone not reading on. */
  summary: string;
  candidateCount: number;
  tier1Count: number;
  distinctPublishers: number;
  /** CVE identifiers named in the topic itself, not in the search results. */
  cves: string[];
  /** Articles the library already holds on this story. */
  covered: { slug: string; title: string; status: string; publishedAt: string }[];
  sources: PreflightSource[];
  searchedAt: string;
}

/**
 * What "well sourced" means here, matching what research.stage.ts will demand of
 * the same topic a minute later: it needs three pages it can read and at least one
 * primary source among them. Asking for three *publishers* rather than three URLs
 * is the stricter and more useful test — four watchTowr pages are one source.
 */
const MIN_PUBLISHERS = 3;
const PER_PUBLISHER = 2;
const MAX_SOURCES_SHOWN = 6;

/** One year of a twice-weekly cadence, the same window the suggester uses. */
const COVERAGE_ROWS = 60;

/**
 * Words that carry no information about *which* story this is.
 *
 * This list is the difference between the check working and the check being
 * decorative. Measured before it existed: the topic "asdkjhasd zzqqwx security
 * thing" came back `ready` on 29 candidates and 11 primary sources — because the
 * queries append "vulnerability advisory", "exploited in the wild" and "CVE patch"
 * to whatever the operator typed, and Tavily happily drops the nonsense words and
 * matches the rest. Every topic looks well sourced when the search is allowed to
 * answer a question the operator did not ask.
 *
 * So a candidate has to mention the topic's own distinctive terms, and the terms
 * the queries injected cannot be among them.
 */
const GENERIC_TERMS = new Set([
  // injected by the queries themselves
  'vulnerability',
  'vulnerabilities',
  'advisory',
  'advisories',
  'exploited',
  'exploit',
  'exploitation',
  'wild',
  'cve',
  'patch',
  'patched',
  'patches',
  // the beat's own vocabulary, true of every story on it
  'security',
  'attack',
  'attacks',
  'attacked',
  'flaw',
  'flaws',
  'bug',
  'breach',
  'breached',
  'hack',
  'hacked',
  'hackers',
  'ransomware',
  'malware',
  'threat',
  'actor',
  'actors',
  'critical',
  'zero',
  'day',
  'active',
  'actively',
  'under',
  'remote',
  'code',
  'execution',
  'bypass',
  'disclosed',
  'disclosure',
  'confirmed',
  'reported',
  'warns',
  'warning',
  'urges',
  'released',
  'affected',
  'impacted',
  'new',
  // English filler that survives the length floor
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'their',
  'there',
  'have',
  'has',
  'been',
  'being',
  'was',
  'were',
  'are',
  'into',
  'over',
  'after',
  'before',
  'about',
  'thing',
  'things',
  'stuff',
  'some',
  'more',
  'most',
  'other',
  'than',
  'then',
  'now',
  'today',
  'week',
  'news',
]);

/** Below this, a token is an initialism the length floor should not eat: XE, UI, OS. */
const MIN_TERM_LENGTH = 3;

@Injectable()
export class TopicPreflightService {
  private readonly logger = new Logger(TopicPreflightService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly search: WebSearchService,
  ) {}

  async check(input: { topic: string; category?: string }): Promise<TopicPreflight> {
    const topic = input.topic.trim();
    const cves = extractCves(topic);

    const { byCve, byKeyword } = await this.covering(topic, cves);
    const covered = [...byCve, ...byKeyword];
    const searchedAt = today();

    // A CVE we have already written about is the same vulnerability, full stop.
    // That is knowable without spending a search, so it is answered before one is
    // spent, and it is the one verdict the operator can act on immediately — the
    // article exists and they can go read it.
    if (byCve.length) {
      return {
        verdict: 'covered',
        blocking: true,
        summary:
          byCve.length === 1
            ? `Already covered by “${byCve[0].title}”.`
            : `Already covered by ${byCve.length} articles in the library.`,
        candidateCount: 0,
        tier1Count: 0,
        distinctPublishers: 0,
        cves,
        covered,
        sources: [],
        searchedAt,
      };
    }

    const found = await this.gather(topic);

    // Only what is actually about this story. See GENERIC_TERMS: without this the
    // check passes everything, because the queries put the security vocabulary in
    // themselves and the search is glad to match it alone.
    const terms = significantTerms(topic);
    const candidates = found.filter((c) => isAbout(c, terms, cves));

    const publishers = new Set(candidates.map((c) => c.publisher));
    const tier1Count = candidates.filter((c) => c.tier === 1).length;
    const sources = pickShown(candidates);

    const base = {
      blocking: false,
      candidateCount: candidates.length,
      tier1Count,
      distinctPublishers: publishers.size,
      cves,
      covered,
      sources,
      searchedAt,
    };

    if (!candidates.length) {
      return {
        ...base,
        verdict: 'unsourceable',
        blocking: true,
        summary: found.length
          ? `Nothing found about this specifically. The search returned ${found.length} ` +
            'security stories, but none of them is about this — check the spelling of ' +
            'the vendor or product, or try a different story.'
          : 'Nothing citable came back for this topic. Check the spelling, or name ' +
            'the vendor and product directly.',
      };
    }

    // Warnings, not refusals, and the distinction is deliberate. Search ranking is
    // a sample, not the record: research.stage.ts runs a primary-source sweep this
    // does not, and a story whose advisory ranked on page two here is a story that
    // still writes. Blocking on a thin result would refuse topics that work, which
    // is a worse failure than spending one run to find out.
    if (!tier1Count) {
      return {
        ...base,
        verdict: 'thin',
        summary:
          `Found ${candidates.length} source${candidates.length === 1 ? '' : 's'}, but no ` +
          'vendor advisory, CISA record or NVD entry among them. The run needs one ' +
          'primary source and may not find it — worth a try, but it can fail.',
      };
    }

    if (publishers.size < MIN_PUBLISHERS) {
      return {
        ...base,
        verdict: 'thin',
        summary:
          `Only ${publishers.size} publisher${publishers.size === 1 ? '' : 's'} covering ` +
          `this so far, and the article needs ${MIN_PUBLISHERS}. It may be too early — ` +
          'the story often picks up more coverage within a day.',
      };
    }

    // Same product, different story — probably.
    //
    // A keyword match means we have written about this vendor before, not that we
    // have written about *this*. A second LoadMaster CVE is a new article and
    // blocking it would be the pipeline refusing real news, so this warns and
    // lets the operator decide with the existing articles in front of them. The
    // CVE case above is the one that is certain enough to block.
    if (byKeyword.length) {
      return {
        ...base,
        verdict: 'covered',
        summary:
          `Well sourced, but you have written about this before. Check the ` +
          `${byKeyword.length === 1 ? 'article' : 'articles'} below — if this is a new ` +
          'development rather than the same story, go ahead.',
      };
    }

    this.logger.log(
      `preflight "${topic.slice(0, 60)}": ${candidates.length} candidate(s), ` +
        `${tier1Count} Tier 1, ${publishers.size} publisher(s)`,
    );

    return {
      ...base,
      verdict: 'ready',
      summary:
        `${publishers.size} publishers covering this, including ${tier1Count} primary ` +
        `source${tier1Count === 1 ? '' : 's'}. Good to write.`,
    };
  }

  /**
   * The same three angled queries and the same primary sweep research.stage.ts
   * runs, for the reason given at the top of the file.
   *
   * A single failing query is tolerated — three queries' worth of evidence still
   * supports a verdict — but every query failing is a provider outage, and
   * reporting that as "nothing found" would send the operator off to rewrite a
   * topic that was fine.
   */
  private async gather(topic: string): Promise<SearchResult[]> {
    const seen = new Map<string, SearchResult>();
    let attempts = 0;
    let failures = 0;
    let firstError: unknown;

    const run = async (fn: () => Promise<SearchResult[]>, label: string) => {
      attempts++;
      try {
        for (const r of await fn()) if (!seen.has(r.url)) seen.set(r.url, r);
      } catch (error) {
        failures++;
        firstError ??= error;
        this.logger.warn(`preflight ${label} failed: ${(error as Error).message}`);
      }
    };

    for (const query of [
      `${topic} vulnerability advisory`,
      `${topic} exploited in the wild`,
      `${topic} CVE patch`,
    ]) {
      await run(() => this.search.search(query, { days: 45 }), `search "${query}"`);
    }
    await run(() => this.search.searchPrimary(topic), 'primary sweep');

    if (failures === attempts) {
      throw firstError instanceof HttpException
        ? firstError
        : new ServiceUnavailableException(
            'The search provider did not respond. This is usually temporary — try again.',
          );
    }

    // Deliberately no NVD-by-CVE synthesis here, unlike research.stage.ts:80. That
    // shortcut fabricates a Tier 1 URL from the topic text, and since the stage
    // started dropping pages that return a shell rather than a record, an NVD
    // detail page is exactly what gets dropped. Counting it would make every
    // CVE-bearing topic read as `ready` on the strength of a page that will not
    // survive the fetch.
    for (const [url] of seen) {
      if (isNotASource(url)) seen.delete(url);
    }

    return [...seen.values()];
  }

  /**
   * What the library already holds on this story.
   *
   * Two tests, returned separately because they do not mean the same thing and
   * must not carry the same consequence. A CVE named in the topic that already
   * sits on an article is the same vulnerability and blocks. An article whose
   * primary keyword appears in the topic — "progress loadmaster" inside "Progress
   * LoadMaster second command injection" — is the same *product*, which is very
   * often a genuinely new story, so it only warns.
   *
   * Drafts and review-stage articles count: a run that finished twenty minutes ago
   * has produced an article with no publication date, and starting the same topic
   * again is exactly the duplicate this prevents.
   */
  private async covering(topic: string, cves: string[]) {
    const recent = await this.prisma.article.findMany({
      where: { status: { in: ['draft', 'review', 'published'] } },
      select: {
        slug: true,
        title: true,
        status: true,
        publishedAt: true,
        primaryKeyword: true,
        cves: true,
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: COVERAGE_ROWS,
    });

    const claimed = new Set(cves.map((c) => c.toUpperCase()));
    const haystack = topic.toLowerCase();
    const strip = ({ slug, title, status, publishedAt }: (typeof recent)[number]) => ({
      slug,
      title,
      status,
      publishedAt,
    });

    const byCve = recent
      .filter((a) => a.cves.some((c) => claimed.has(c.toUpperCase())))
      .map(strip);

    const seen = new Set(byCve.map((a) => a.slug));
    const byKeyword = recent
      .filter((a) => {
        if (seen.has(a.slug)) return false;
        const keyword = a.primaryKeyword.trim().toLowerCase();
        // Guard the degenerate case: a one-word keyword like "ransomware" matches
        // half the beat and would report every ransomware story as covered.
        return keyword.includes(' ') && haystack.includes(keyword);
      })
      .map(strip);

    return { byCve, byKeyword };
  }
}

/**
 * The words in a topic that identify which story it is: the vendor, the product,
 * the organisation. Everything the queries inject, and everything true of every
 * story on this beat, is dropped — see GENERIC_TERMS.
 *
 * The length floor is 3 rather than 4 so `ios`, `sap` and `aws` survive. Two-letter
 * initialisms (`XE`, `UI`, `OS`) are lost, which is acceptable: they never appear
 * without the vendor beside them.
 */
export function significantTerms(topic: string): string[] {
  return [
    ...new Set(
      topic
        .toLowerCase()
        .split(/[^a-z0-9.]+/)
        .map((t) => t.replace(/^\.+|\.+$/g, ''))
        .filter((t) => t.length >= MIN_TERM_LENGTH && !GENERIC_TERMS.has(t)),
    ),
  ];
}

/**
 * Whether a search result is about the topic rather than merely about security.
 *
 * A CVE named in the topic and echoed by the candidate settles it outright — that
 * is an exact identifier and there is nothing to weigh. Otherwise the candidate has
 * to carry two of the topic's distinctive terms, which is what stops a page
 * matching on one incidental word from counting. One term is enough only when the
 * topic offers only one, as `"CVE-2026-8037"` or `"Metabase"` do.
 */
export function isAbout(
  candidate: { title: string; snippet: string },
  terms: string[],
  cves: string[],
): boolean {
  const text = `${candidate.title} ${candidate.snippet}`.toLowerCase();

  if (cves.some((cve) => text.includes(cve.toLowerCase()))) return true;
  if (!terms.length) return false;

  const matched = terms.filter((t) => text.includes(t)).length;
  return matched >= (terms.length >= 2 ? 2 : 1);
}

/**
 * A short, varied list for the operator to click — not the ranking the research
 * stage will use. Primary sources first because those are the ones that decide
 * whether the topic is writable, and capped per publisher so six results from one
 * outlet do not read as six sources.
 */
function pickShown(candidates: SearchResult[]): PreflightSource[] {
  const byPublisher = new Map<string, number>();
  const out: PreflightSource[] = [];

  for (const c of [...candidates].sort((a, b) => a.tier - b.tier)) {
    if (out.length >= MAX_SOURCES_SHOWN) break;
    const used = byPublisher.get(c.publisher) ?? 0;
    if (used >= PER_PUBLISHER) continue;
    byPublisher.set(c.publisher, used + 1);
    out.push({ title: c.title, url: c.url, publisher: c.publisher, tier: c.tier });
  }

  return out;
}
