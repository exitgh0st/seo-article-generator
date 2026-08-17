import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { WebSearchService, type SearchResult } from '../../tools/web-search.service';
import { WebFetchService } from '../../tools/web-fetch.service';
import { extractCves, isNotASource } from '../../tools/source-filters';
import { ResearchService } from '../../research/research.service';
import { mentions } from '../../research/grounding.service';
import { DeepSeekService } from '../deepseek.service';
import { PromptsService, today } from '../prompts.service';
import { StageError, TopicUnworkableError } from '../errors';
import { stripBodyFence } from '../post-process';
import type { Stage, StageContext, StageResult } from '../stage.types';

/**
 * Search, fetch, store, then summarise.
 *
 * The order matters and it is the opposite of what the old agent did. Searching
 * and fetching happen here in TypeScript; the model never touches a URL. It is
 * handed the extracted text and asked to write the brief from it.
 *
 * That is what makes the grounding gate mean anything. `rawContent` is written
 * from the actual fetch, so a later article's CVE identifiers and indicators are
 * checked against what the page really said — not against a summary the model
 * produced and then cited itself for.
 */

const MAX_FETCH = 8;
const MIN_SOURCES = 3;

/**
 * Only the short structured fields. The brief itself comes back as text from a
 * second call — see the comment at the call site.
 */
const BriefLabelsSchema = z.object({
  topic: z.string().min(3),
  summary: z.string().min(20),
});

@Injectable()
export class ResearchStage implements Stage {
  readonly name = 'research' as const;
  private readonly logger = new Logger(ResearchStage.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly search: WebSearchService,
    private readonly webFetch: WebFetchService,
    private readonly research: ResearchService,
    private readonly deepseek: DeepSeekService,
    private readonly prompts: PromptsService,
  ) {}

  async run(ctx: StageContext): Promise<StageResult> {
    const { topic } = ctx.run;

    const seen = new Map<string, SearchResult>();

    // Several angled queries rather than one broad one. A single query returns
    // one narrative; the vendor advisory and the exploitation report usually
    // surface on different phrasings.
    for (const query of [
      `${topic} vulnerability advisory`,
      `${topic} exploited in the wild`,
      `${topic} CVE patch`,
    ]) {
      const results = await this.search.search(query, { days: 45 });
      for (const r of results) if (!seen.has(r.url)) seen.set(r.url, r);
    }

    // A news-ranked search finds outlets, not advisories. Measured on this
    // topic, three news queries returned twelve results and zero Tier 1 — the
    // NVD record and the CISA alert simply are not "news". Ask for the primary
    // sources explicitly, unranked by recency.
    for (const r of await this.search.searchPrimary(topic)) {
      if (!seen.has(r.url)) seen.set(r.url, r);
    }

    // A CVE identifier resolves to a known-good Tier 1 URL with no search at
    // all. Cheaper and more reliable than hoping a ranking surfaces it.
    for (const cve of extractCves(topic)) {
      const url = `https://nvd.nist.gov/vuln/detail/${cve}`;
      if (!seen.has(url)) {
        seen.set(url, {
          title: `${cve} Detail`,
          url,
          snippet: '',
          publisher: 'NVD',
          tier: 1,
          vendorResearch: false,
          publishedDate: null,
        });
      }
    }

    // Social posts, search-result pages and paginated indexes are not sources.
    // They fetch successfully, which is what makes them worth excluding here
    // rather than letting them consume one of the eight fetch slots.
    for (const [url] of seen) {
      if (isNotASource(url)) seen.delete(url);
    }

    if (!seen.size) {
      throw new TopicUnworkableError(
        `No search results for "${topic}".`,
        'Nothing at all was found for that topic, so there is nothing to write ' +
          'from. Check the spelling, or start a different topic.',
      );
    }

    const ranked = selectSources([...seen.values()]);

    const fetched: {
      url: string;
      title: string;
      publisher: string;
      tier: 1 | 2 | 3;
      accessedAt: string;
      rawContent: string;
    }[] = [];
    const failures: string[] = [];

    for (const candidate of ranked) {
      try {
        const page = await this.webFetch.fetchPage(candidate.url);

        // A page whose URL names a CVE but whose extracted text never mentions
        // it did not render. NVD is a client-side application, and a plain
        // fetch of /vuln/detail/CVE-x gets a 2KB shell of chrome and no record.
        //
        // Keeping it is worse than dropping it, and worse than a failed fetch.
        // The corpus below labels every source with its URL, so the model is
        // handed the identifier, writes it into the brief in good faith, and the
        // draft inherits it — while the stored text can never ground it, because
        // the text does not contain it. That is not the model inventing a fact;
        // it is this stage feeding it one. Measured 2026-08-17: two NVD shells
        // put CVE-2026-48356 and CVE-2026-48000 into an Adobe Commerce brief and
        // the draft stage died on the grounding gate with no way to see why.
        //
        // Dropping it here also keeps it out of the Tier 1 count below, which it
        // was otherwise satisfying while proving nothing.
        const named = extractCves(page.finalUrl);
        const unrendered = named.filter((cve) => !mentions(page.markdown, cve));
        if (unrendered.length) {
          failures.push(
            `${hostOf(candidate.url)} (returned no text mentioning ${unrendered.join(', ')} — page did not render)`,
          );
          continue;
        }

        // finalUrl, not url: cite where the redirect landed, which is also what
        // the publish preflight will later re-check for liveness.
        fetched.push({
          url: page.finalUrl,
          title: page.title || candidate.title,
          publisher: page.publisher || candidate.publisher,
          tier: page.tier as 1 | 2 | 3,
          accessedAt: today(),
          rawContent: page.markdown,
        });
      } catch (error) {
        // A 403 from a vendor advisory is normal and worth reporting in the
        // brief rather than failing over — it changes how the piece can source
        // vendor statements.
        failures.push(`${hostOf(candidate.url)} (${(error as Error).message})`);
      }
    }

    if (fetched.length < MIN_SOURCES) {
      throw new StageError(
        `Only ${fetched.length} of ${ranked.length} candidate page(s) could be read.`,
        'provider',
        `Only ${fetched.length} source${fetched.length === 1 ? '' : 's'} could be read, and at least ${MIN_SOURCES} are needed. This is often temporary — press Retry.`,
      );
    }

    if (!fetched.some((f) => f.tier === 1)) {
      throw new TopicUnworkableError(
        'No Tier 1 source among the fetched pages.',
        'No primary source — a vendor advisory, CISA, or NVD — could be read for ' +
          'this topic, and an article without one is not publishable. Running this ' +
          'again searches the same web and finds the same nothing. Start a ' +
          'different topic, or name the vendor or the CVE directly in it.',
      );
    }

    // Cap what goes to the model. The full text stays in the database for
    // grounding regardless.
    const corpus = fetched
      .map(
        (f, i) =>
          `## [S${i + 1}] ${f.title}\nPublisher: ${f.publisher} (Tier ${f.tier})\nURL: ${f.url}\n\n${f.rawContent.slice(0, 9_000)}`,
      )
      .join('\n\n---\n\n');

    // Two calls, for the same reason draft.stage.ts uses two.
    //
    // This asked for the whole brief as a `markdown` string inside a JSON
    // object. Every character of a 3,000-word brief then has to be escaped
    // inside a JSON string, and on long corpora the reply came back unparseable
    // or missing the field: measured twice on the Gunra advisory, each time
    // killing the run at its first stage with nothing saved.
    //
    // The labels are short and structured, so they stay JSON. The brief is long
    // prose, so it comes back as text.
    const sharedContext = [
      this.prompts.preamble(),
      '',
      '--- SOURCE TIERING ---',
      this.prompts.doc('sources'),
      '',
      'You are writing a research brief from the source text supplied. The brief',
      'is the frozen fact set a later step writes the article from, so anything',
      'absent from it cannot appear in the article.',
    ].join('\n');

    const { value: labels, usage: labelUsage } = await this.deepseek.json(
      BriefLabelsSchema,
      [
        sharedContext,
        '',
        '--- YOUR TASK ---',
        'Return JSON: { "topic": string, "summary": string }.',
        '"topic" is a short noun phrase naming the story, for the filename.',
        '"summary" is two or three sentences: what happened, who is affected, why',
        'it matters. Do not write the brief itself.',
      ].join('\n'),
      corpus,
      { maxTokens: 600 },
    );

    const { value: markdown, usage: briefUsage } = await this.deepseek.text(
      [
        sharedContext,
        '',
        '--- YOUR TASK ---',
        'Output the brief as markdown and nothing else. No JSON, no preamble, no',
        'code fence around it. The caller saves your entire response as the brief.',
        '',
        'Use these H2 sections in this order: Summary, Confirmed facts, Reported,',
        'Claimed, Timeline, Affected products and versions, Exploitation status,',
        'Attribution, Quotes, Mitigation, Conflicts between sources, Open questions.',
        '',
        'Cite every fact with the [S1]-style marker of the source it came from.',
        'Where two sources disagree, record both under "Conflicts between sources"',
        'and attribute each — do not reconcile them.',
        'Where something is not stated anywhere, write "Not stated in sources".',
      ].join('\n'),
      corpus,
      { maxTokens: 6_000 },
    );

    const value = {
      topic: labels.topic,
      summary: labels.summary,
      markdown: stripBodyFence(markdown).trim(),
    };
    const usage = {
      inputTokens: labelUsage.inputTokens + briefUsage.inputTokens,
      outputTokens: labelUsage.outputTokens + briefUsage.outputTokens,
    };

    const slug = `${today()}-${slugify(value.topic)}`.slice(0, 80);

    // Idempotent: ResearchService.save() replaces the brief's sources wholesale,
    // so a retry of this stage overwrites rather than duplicating.
    const saved = await this.research.save({
      slug,
      topic: value.topic,
      researchedAt: today(),
      status: 'ready',
      markdown:
        value.markdown +
        (failures.length
          ? `\n\n**Could not be fetched:** ${failures.join('; ')}. Vendor statements from these are second-hand.`
          : ''),
      sources: fetched.map((f) => ({
        title: f.title,
        url: f.url,
        publisher: f.publisher,
        tier: f.tier,
        accessedAt: f.accessedAt,
        rawContent: f.rawContent,
      })),
    });

    this.logger.log(
      `brief ${slug}: ${fetched.length} source(s), ${fetched.filter((f) => f.tier === 1).length} Tier 1, ${failures.length} unreadable`,
    );

    return {
      output: {
        briefSlug: saved.slug,
        summary: value.summary,
        sourceCount: fetched.length,
        tier1Count: fetched.filter((f) => f.tier === 1).length,
        unreadable: failures,
      },
      usage,
      runPatch: { briefSlug: saved.slug },
    };
  }
}

/**
 * Choose which candidates to fetch.
 *
 * Sorting purely by tier looks right and is not: once the primary-source search
 * was added, one topic returned eight Tier 1 candidates and they filled every
 * slot, leaving a brief with no outlet reporting at all. `docs/sources.md` wants
 * Tier 1 to *anchor* the piece and Tier 2 to supply the narrative and the
 * quotes — a brief of nothing but advisories has no story in it.
 *
 * So the slots are reserved rather than competed for, and no single publisher
 * takes more than two of them. Four watchTowr pages are one source, not four.
 */
function selectSources(candidates: SearchResult[]): SearchResult[] {
  const PER_PUBLISHER = 2;
  const TIER_1_SLOTS = 5;

  const byPublisher = new Map<string, number>();
  const take = (pool: SearchResult[], limit: number) => {
    const out: SearchResult[] = [];
    for (const c of pool) {
      if (out.length >= limit) break;
      const used = byPublisher.get(c.publisher) ?? 0;
      if (used >= PER_PUBLISHER) continue;
      byPublisher.set(c.publisher, used + 1);
      out.push(c);
    }
    return out;
  };

  const tier1 = candidates.filter((c) => c.tier === 1);
  const tier2 = candidates.filter((c) => c.tier === 2);
  const tier3 = candidates.filter((c) => c.tier === 3);

  const chosen = [
    ...take(tier1, TIER_1_SLOTS),
    ...take(tier2, MAX_FETCH - TIER_1_SLOTS),
  ];

  // Only if the first two tiers could not fill the quota. Tier 3 is a lead, and
  // never the sole support for a claim.
  if (chosen.length < MAX_FETCH) {
    chosen.push(...take(tier3, MAX_FETCH - chosen.length));
  }

  return chosen;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .filter((w) => w && !STOPWORDS.has(w))
    .slice(0, 6)
    .join('-');
}

const STOPWORDS = new Set(['a', 'an', 'the', 'of', 'for', 'in', 'on', 'to', 'and']);

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
