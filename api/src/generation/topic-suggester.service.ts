import {
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { WebSearchService, type SearchResult } from '../tools/web-search.service';
import { extractCves, isNotASource } from '../tools/source-filters';
import type { SourceTier } from '../tools/source-tiers';
import { DeepSeekService } from './deepseek.service';
import { PromptsService, today } from './prompts.service';
import { OutputValidationError, RefusalError, StageError } from './errors';
import { ARTICLE_CATEGORIES, type ArticleCategory } from '../seo/article.types';

/**
 * What is worth writing today, minus what we have already written.
 *
 * The pipeline has never known what this site covers. An operator types a topic
 * from memory, and nothing between that box and a published article checks
 * whether the same CVE already has a piece on it — the only query of other
 * articles anywhere in generation/ is InternalLinksService, and it is looking for
 * things to link to, not things to avoid. This is the first component that reads
 * the library in order to say no.
 *
 * It is deliberately not a stage. It creates no run, no brief and no rows, and
 * the operator still presses Start afterwards. A suggester that started runs
 * would be an autopilot, and the one judgement this system genuinely needs a
 * person for is which story is worth the money.
 *
 * Two filters run, in this order, and the order is the point. Code drops any
 * candidate carrying a CVE that already appears on an article we hold: that is
 * exact, free, and not a matter of opinion. Only the fuzzy remainder — the same
 * breach reported a second time under a different headline, with no identifier to
 * match on — is put to the model. Asking the model to do the first filter as well
 * would spend tokens to get a worse answer on the half of the problem a string
 * comparison already settles.
 *
 * The model is never shown a URL and never asked for one. It picks from a
 * numbered candidate list and returns indexes; TypeScript resolves them back to
 * the search results it already held. Every link the operator clicks is therefore
 * one Tavily actually returned — the same discipline research.stage.ts uses, for
 * the same reason. A fabricated source that looks plausible is worse than none.
 *
 * Search snippets are attacker-influenceable text placed in a prompt. The blast
 * radius is small by construction: the model's only outputs are indexes and short
 * strings, all validated, and it cannot cause a fetch, a write or a run.
 */

/**
 * Security news goes stale in hours, and a wide window is what makes "already
 * covered" stop meaning anything — at research.stage.ts's 45 days the candidate
 * list is mostly last month's work. Widened once, and only when the week was
 * genuinely quiet rather than when a provider was down.
 */
const WINDOW_DAYS = 7;
const WIDER_WINDOW_DAYS = 21;
const MIN_CANDIDATES = 6;

/** What reaches the prompt. */
const TIER_1_SLOTS = 6;
const MAX_CANDIDATES = 14;
const PER_PUBLISHER = 2;

/**
 * One year of a twice-weekly cadence. A story older than the library's tail
 * resurfacing is a legitimately new article anyway.
 */
const COVERAGE_ROWS = 60;

/** A source the operator can click before committing to a run. */
export interface SuggestionSource {
  title: string;
  url: string;
  publisher: string;
  tier: SourceTier;
}

export interface TopicSuggestion {
  /** Drops straight into the topic field, phrased as the operator would type it. */
  topic: string;
  /** Drops into primaryKeyword. Noun phrase, the rule the angle stage enforces. */
  primaryKeyword: string;
  category: ArticleCategory;
  /** One sentence on why this is worth writing today. Read, never submitted. */
  why: string;
  /** Resolved in TypeScript from the model's indexes. Never model-authored. */
  sources: SuggestionSource[];
  cves: string[];
  /** At least one Tier 1 source, so the article is sourceable at all. */
  hasPrimarySource: boolean;
}

export interface TopicSuggestionsResponse {
  suggestions: TopicSuggestion[];
  /** Distinct stories that reached the ranking step. */
  consideredCount: number;
  /** Dropped in code because a CVE already appears on an article we hold. */
  excludedCount: number;
  /** YYYY-MM-DD. The end of the window the search covered. */
  searchedAt: string;
  /**
   * Set when, and only when, `suggestions` is empty. This is how the screen tells
   * a quiet week from something being broken, which are the same HTTP status and
   * must not read as the same event.
   */
  note?: string;
}

/**
 * No `.min()` on the array, on purpose.
 *
 * "Nothing here we have not already written" is a correct answer some weeks, and
 * a floor of three makes inventing a story the cheapest way to satisfy the
 * contract — the schema would be reaching past the model's judgement to force the
 * one output this feature must never produce.
 */
const SuggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        topic: z.string().min(12).max(200),
        primaryKeyword: z.string().min(3).max(60),
        category: z.enum(ARTICLE_CATEGORIES),
        // 280 rejected roughly half of real answers once the prompt started
        // asking for a sourcing caveat as well as the news. The limit exists to
        // keep the card scannable, not to win an argument with the model — and
        // the prompt now states it, because a bound the model is not told about
        // is one it fails at random.
        why: z.string().min(20).max(400),
        sourceIndexes: z
          .array(z.number().int().min(1).max(MAX_CANDIDATES))
          .min(1)
          .max(4),
      }),
    )
    .max(5),
});

/**
 * Three queries per beat, not one.
 *
 * The same reasoning as research.stage.ts, and it bites harder here: there is no
 * topic to anchor on, so one broad query returns whichever story an aggregator
 * ranked highest this hour and the suggestions become three angles on it rather
 * than three stories.
 */
const QUERIES_BY_CATEGORY: Record<ArticleCategory, string[]> = {
  vulnerabilities: [
    'critical vulnerability actively exploited in the wild',
    'CVE added to CISA known exploited vulnerabilities catalog',
    'zero-day emergency patch released vendor advisory',
  ],
  breaches: [
    'data breach disclosed customer records exposed',
    'company confirms security incident regulatory filing',
    'unauthorized access breach notification attorney general',
  ],
  ransomware: [
    'ransomware attack claims victim leak site',
    'ransomware group new encryptor variant analysis',
    'ransomware incident operations disrupted recovery',
  ],
  'threat-intel': [
    'APT campaign new malware threat research',
    'threat actor infrastructure targeting sector',
    'espionage operation attributed nation state',
  ],
  policy: [
    'CISA emergency directive federal agencies deadline',
    'cybersecurity regulation enforcement action penalty',
    'joint cybersecurity advisory international agencies',
  ],
  'ai-security': [
    'AI model prompt injection vulnerability disclosed',
    'LLM agent security flaw research exploit',
    'machine learning supply chain model poisoning',
  ],
};

/** No category: one query per major beat rather than three on any one of them. */
const QUERIES_ALL_BEATS = [
  'critical vulnerability exploited in the wild advisory',
  'ransomware attack data breach disclosed this week',
  'CISA advisory emergency directive threat actor',
];

/** searchPrimary takes a topic string, so each beat needs one. */
const PRIMARY_SWEEP_BY_CATEGORY: Record<ArticleCategory, string> = {
  vulnerabilities: 'critical vulnerability exploited advisory',
  breaches: 'data breach notification disclosure',
  ransomware: 'ransomware joint cybersecurity advisory',
  'threat-intel': 'threat actor campaign advisory',
  policy: 'emergency directive binding operational directive',
  'ai-security': 'AI model security advisory',
};

const PRIMARY_SWEEP_ALL_BEATS = 'exploited vulnerability advisory disclosed';

@Injectable()
export class TopicSuggesterService {
  private readonly logger = new Logger(TopicSuggesterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly search: WebSearchService,
    private readonly deepseek: DeepSeekService,
    private readonly prompts: PromptsService,
  ) {}

  async suggest(input: { category?: string } = {}): Promise<TopicSuggestionsResponse> {
    const category = input.category as ArticleCategory | undefined;

    const { candidates, allFailed, firstError } = await this.gather(category);
    if (allFailed) {
      throw firstError instanceof HttpException
        ? firstError
        : new ServiceUnavailableException(
            'The search provider did not respond. This is usually temporary — try again.',
          );
    }

    const ranked = rankCandidates(candidates);
    const covered = await this.coverage();

    const coveredCves = new Set(
      covered.flatMap((a) => a.cves.map((c) => c.toUpperCase())),
    );

    let excludedCount = 0;
    const fresh = ranked.filter((c) => {
      const cves = extractCves(`${c.title} ${c.snippet}`);
      if (cves.some((cve) => coveredCves.has(cve))) {
        excludedCount++;
        return false;
      }
      return true;
    });

    // Nothing to choose from, so there is nothing to ask. The honest answer is
    // free and the model call is not.
    if (!fresh.length) {
      return {
        suggestions: [],
        consideredCount: ranked.length,
        excludedCount,
        searchedAt: today(),
        note: excludedCount
          ? `Found ${excludedCount} recent ${excludedCount === 1 ? 'story' : 'stories'}, all already covered by articles in the library.`
          : 'No sourceable security stories surfaced in the last week. Try again later, or type a topic yourself.',
      };
    }

    const coverageBlock = covered
      .map((a) =>
        [a.publishedAt, a.category, a.primaryKeyword, a.cves.join(' ') || '-', a.title].join(
          ' | ',
        ),
      )
      .join('\n');

    let suggestions: TopicSuggestion[];
    let offered: number;
    try {
      const { value } = await this.deepseek.json(
        SuggestionsSchema,
        this.systemPrompt(),
        userPrompt(coverageBlock, fresh),
        {
          // Generous on purpose. The schema's `.max(5)` is what bounds the
          // answer; this only has to be too large to bind, because a cap that
          // binds arrives as finish_reason `length` — truncated JSON that
          // fails to parse and costs the whole call rather than one field.
          maxTokens: 2_500,
          // Below the 0.3 default. This is selection and compression from text
          // sitting in the prompt; the only thing temperature buys here is a
          // story that was not in the candidate list. Variation between presses
          // should come from the search, not the sampler.
          temperature: 0.2,
        },
      );
      offered = value.suggestions.length;
      suggestions = resolveSources(value.suggestions, fresh);
    } catch (error) {
      this.rethrow(error);
    }

    // Two different events, and they must not read as one.
    //
    // The model returning nothing is a judgement — a quiet week — and gets a
    // note. The model returning suggestions that all cite candidates it was not
    // offered is the shape an invented answer takes, and gets a retry. Reporting
    // the second as the first teaches the operator to stop pressing the button.
    if (!suggestions.length && offered) {
      this.rethrow(
        new OutputValidationError('Every suggestion cited a candidate that was not offered.'),
      );
    }

    if (!suggestions.length) {
      return {
        suggestions: [],
        consideredCount: ranked.length,
        excludedCount,
        searchedAt: today(),
        note: 'Nothing surfaced this week that is not already covered. Try again later, or type a topic yourself.',
      };
    }

    this.logger.log(
      `suggest${category ? ` [${category}]` : ''}: ${ranked.length} candidate(s), ` +
        `${excludedCount} already covered, ${suggestions.length} suggested`,
    );

    return {
      suggestions,
      consideredCount: ranked.length,
      excludedCount,
      searchedAt: today(),
    };
  }

  /**
   * Four Tavily calls: three news queries and one primary-source sweep.
   *
   * A failing query is counted rather than thrown. This endpoint returns advice,
   * and three queries' worth of advice beats a 503 — but every query failing is a
   * provider outage and should say so.
   */
  private async gather(category?: ArticleCategory) {
    const queries = category ? QUERIES_BY_CATEGORY[category] : QUERIES_ALL_BEATS;
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
        this.logger.warn(`${label} failed: ${(error as Error).message}`);
      }
    };

    for (const query of queries) {
      await run(() => this.search.search(query, { days: WINDOW_DAYS }), `search "${query}"`);
    }

    // A news ranking finds outlets, not advisories — the same measurement that
    // put searchPrimary into the research stage. The suggester is asked to prefer
    // stories with primary-source coverage, so it goes looking for them rather
    // than hoping the outlets surface one.
    await run(
      () =>
        this.search.searchPrimary(
          category ? PRIMARY_SWEEP_BY_CATEGORY[category] : PRIMARY_SWEEP_ALL_BEATS,
        ),
      'primary sweep',
    );

    if (failures === attempts) {
      return { candidates: [], allFailed: true, firstError };
    }

    prune(seen, WINDOW_DAYS);

    // A quiet week, not a broken one. Widening after a failure would just be
    // three more failures.
    if (seen.size < MIN_CANDIDATES && failures === 0) {
      for (const query of queries) {
        await run(
          () => this.search.search(query, { days: WIDER_WINDOW_DAYS }),
          `search "${query}" (widened)`,
        );
      }
      prune(seen, WIDER_WINDOW_DAYS);
    }

    return { candidates: [...seen.values()], allFailed: false, firstError };
  }

  /**
   * The library, as a filter.
   *
   * Drafts and review-stage articles count. A run that finished twenty minutes
   * ago has a draft and no publication date, and suggesting its topic again is
   * exactly the duplicate this exists to prevent.
   *
   * `tags` and `secondaryKeywords` are deliberately not selected. Both are broad
   * by construction — the pipeline tops secondary keywords up from whatever the
   * body happens to contain — so rendered into the prompt they read as coverage
   * of a whole beat, and the model then excludes every ransomware story because
   * we once wrote about ransomware.
   */
  private coverage() {
    return this.prisma.article.findMany({
      where: { status: { in: ['draft', 'review', 'published'] } },
      select: {
        slug: true,
        title: true,
        primaryKeyword: true,
        cves: true,
        category: true,
        publishedAt: true,
      },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: COVERAGE_ROWS,
    });
  }

  private systemPrompt(): string {
    return [
      this.prompts.preamble(),
      '',
      '--- SOURCE TIERING ---',
      this.prompts.doc('sources'),
      '',
      '--- YOUR TASK ---',
      'You are picking which stories are worth writing this week. You are not',
      'writing anything. Someone will read your list, choose one, and press a',
      'button — so every entry has to be a story a person could act on, not a',
      'category of story.',
      '',
      'You will be given two lists. ALREADY COVERED is what this publication has',
      'written. CANDIDATES is what the search returned, numbered.',
      '',
      'Return JSON: { "suggestions": [{ "topic", "primaryKeyword", "category",',
      '"why", "sourceIndexes" }] }. Between three and five entries, ordered',
      'strongest sourcing first.',
      '',
      'Return fewer than three, or an empty array, when that is the truth. A quiet',
      'week is a real answer and the person reading this can handle it. Padding',
      'the list with a story you cannot support from the candidates is the one',
      'failure that matters here.',
      '',
      'EXCLUDE anything in ALREADY COVERED. That means the same incident, not the',
      'same wording: "Akira claims Hitachi" and "Hitachi confirms ransomware',
      'breach" are one story. A genuinely new development on a covered story — an',
      'exploit now public, a patch now out, a victim count now confirmed — is a',
      'new story, and you should say which development in "why".',
      '',
      'PREFER stories with Tier 1 coverage in the candidate list. The list is a',
      'sample of a search, not everything published, so most stories appear once',
      'and a single candidate is not evidence that a story is thinly sourced —',
      'do not exclude one for that. What it does mean is that you have seen only',
      'that one account: where a story rests entirely on Tier 2 reporting here,',
      'say so in "why" rather than asserting the claim as settled.',
      '',
      '"topic" is what the operator would have typed: the vendor and product, or',
      'the organisation and what happened to it, in one line.',
      'Good: "Fortinet FortiWeb path traversal exploited in the wild",',
      '"Conduent confirms data breach affecting 10.5 million people".',
      'Bad: "New critical vulnerability", "Ransomware activity increases",',
      '"Enterprise security challenges this quarter".',
      '',
      '"primaryKeyword" is the search query the article would target, and it has',
      'one hard constraint: **it must be a noun phrase naming a thing** — the',
      'product, or the product and its flaw. Two or three words, lowercase.',
      'Good: "fortinet fortiweb", "fortiweb path traversal", "conduent breach".',
      'Bad: "fortiweb patch deadline", "what to do about fortiweb",',
      '"cve-2026-8037 patch now".',
      'The test is whether the phrase can sit inside an ordinary sentence four to',
      'eight times without sounding stapled on. An action phrase or a question',
      'cannot, and a keyword nobody can use is a keyword used zero times. Never',
      'put a CVE identifier in it.',
      '',
      `"category" is exactly one of: ${ARTICLE_CATEGORIES.join(', ')}. Pick the one`,
      'the article would file under, not the one that sounds broadest.',
      '',
      '"why" is one or two sentences to a busy editor: what is new, who it hits,',
      'and why today rather than last week. Not a summary of the story. Keep it',
      'under 400 characters — it is read on a card, and a third sentence is one',
      'nobody reads.',
      '',
      '"sourceIndexes" are the numbers of the candidates this suggestion rests on,',
      'between one and four of them. Use the numbers as printed. Do not write',
      'URLs; any suggestion whose indexes do not resolve is discarded unread.',
    ].join('\n');
  }

  /**
   * The pipeline records a StageError on a row and lets the operator press Retry.
   * There is no row here and no worker, so the same classification has to arrive
   * as a status code — and the remedy text is reused verbatim, because an
   * operator who sees two wordings for one condition learns the wording is noise.
   */
  private rethrow(error: unknown): never {
    if (error instanceof HttpException) throw error;

    // The operator gets the remedy; the log keeps what actually happened. A
    // stage would have written this to its row — there is no row here, so
    // without this line the real message is discarded at the boundary.
    this.logger.warn(`suggest failed: ${(error as Error)?.message ?? String(error)}`);

    if (error instanceof RefusalError) {
      // 422, not 503: the request was well formed and retrying it unchanged will
      // fail the same way. The operator needs to type a topic instead.
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: error.remedy ?? error.message,
        kind: error.kind,
      });
    }
    if (error instanceof StageError) {
      throw new ServiceUnavailableException(error.remedy ?? error.message);
    }
    throw error;
  }
}

/**
 * searchPrimary sets `general: true`, which Tavily requires but which also drops
 * the date filter — an advisory from two years ago ranks perfectly well for it.
 * Dated results outside the window go. Undated ones stay: vendor PSIRT pages
 * frequently carry no parseable date and they are the candidates worth keeping.
 */
function prune(seen: Map<string, SearchResult>, days: number): void {
  const cutoff = Date.now() - days * 86_400_000;

  for (const [url, r] of seen) {
    if (isNotASource(url)) {
      seen.delete(url);
      continue;
    }
    const published = r.publishedDate ? Date.parse(r.publishedDate) : NaN;
    if (!Number.isNaN(published) && published < cutoff) seen.delete(url);
  }
}

/**
 * Rank for story diversity, not citation depth.
 *
 * selectSources() in research.stage.ts reserves five of eight fetch slots for
 * Tier 1 because a brief needs an advisory to anchor it. This list is not a
 * brief: it is a menu, and eight advisories about one CVE is one item on it. So
 * the per-publisher cap does most of the work, and Tier 3 is dropped outright —
 * a story visible only on an aggregator is a story we could not source, and
 * offering it to the operator spends a whole run to discover that.
 */
function rankCandidates(all: SearchResult[]): SearchResult[] {
  const byPublisher = new Map<string, number>();
  // The Tier 1 top-up below draws from a pool it has already drawn from, so
  // without this a single advisory is offered to the model twice under two
  // different numbers — and the model can then cite one story as two.
  const taken = new Set<string>();

  const take = (pool: SearchResult[], limit: number) => {
    const out: SearchResult[] = [];
    for (const c of pool) {
      if (out.length >= limit) break;
      if (taken.has(c.url)) continue;
      const used = byPublisher.get(c.publisher) ?? 0;
      if (used >= PER_PUBLISHER) continue;
      byPublisher.set(c.publisher, used + 1);
      taken.add(c.url);
      out.push(c);
    }
    return out;
  };

  const tier1 = all.filter((c) => c.tier === 1);
  const tier2 = all.filter((c) => c.tier === 2);

  const chosen = [...take(tier1, TIER_1_SLOTS), ...take(tier2, MAX_CANDIDATES - TIER_1_SLOTS)];

  // Tier 2 could not fill its half. Spend the remainder on Tier 1 rather than
  // reaching for Tier 3, which is a lead and never a sole support.
  if (chosen.length < MAX_CANDIDATES) {
    chosen.push(...take(tier1, MAX_CANDIDATES - chosen.length));
  }

  return chosen;
}

function userPrompt(coverageBlock: string, fresh: SearchResult[]): string {
  return [
    '--- ALREADY COVERED ---',
    'date | category | primary keyword | CVEs | title',
    coverageBlock || '(nothing yet)',
    '',
    '--- CANDIDATES ---',
    fresh
      .map((c, i) =>
        [
          `[${i + 1}] ${c.title}`,
          `Publisher: ${c.publisher} (Tier ${c.tier})${c.vendorResearch ? ', vendor research' : ''}`,
          `Published: ${c.publishedDate ?? 'not stated'}`,
          c.snippet,
        ].join('\n'),
      )
      .join('\n\n'),
  ].join('\n');
}

/** Indexes back to the search results the caller already held. */
function resolveSources(
  suggestions: z.infer<typeof SuggestionsSchema>['suggestions'],
  fresh: SearchResult[],
): TopicSuggestion[] {
  return suggestions
    .map(({ sourceIndexes, ...rest }) => {
      const cited = sourceIndexes
        .map((i) => fresh[i - 1])
        .filter((c): c is SearchResult => Boolean(c));

      return {
        ...rest,
        sources: cited.map((c) => ({
          title: c.title,
          url: c.url,
          publisher: c.publisher,
          tier: c.tier,
        })),
        // Read out of the search text, not out of the model's prose. `why` and
        // `topic` are written by the model, and a CVE identifier lifted from
        // either would be the one thing on this screen nothing had verified.
        cves: extractCves(cited.map((c) => `${c.title} ${c.snippet}`).join(' ')),
        hasPrimarySource: cited.some((c) => c.tier === 1),
      };
    })
    .filter((s) => s.sources.length > 0);
}
