import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { TopicSuggesterService } from './topic-suggester.service';
import { OutputValidationError, RefusalError } from './errors';
import type { PrismaService } from '../prisma/prisma.service';
import type { WebSearchService, SearchResult } from '../tools/web-search.service';
import type { DeepSeekService } from './deepseek.service';
import type { PromptsService } from './prompts.service';

/**
 * The two properties worth protecting are the ones a model cannot be trusted to
 * hold on its own.
 *
 * First, the CVE exclusion is a string comparison in code, not an instruction in
 * a prompt — so a candidate carrying a CVE we have already written about must
 * never reach the model at all, and the tests assert on `deepseek.json` never
 * being called rather than on the shape of the answer.
 *
 * Second, every URL the operator can click is one Tavily returned. The model
 * gets numbered candidates and hands back indexes, so the tests check that no
 * URL is ever in the prompt and that a suggestion citing a candidate it was not
 * offered is dropped rather than shown.
 */

const result = (over: Partial<SearchResult> = {}): SearchResult => ({
  title: 'Fortinet FortiWeb path traversal exploited, CVE-2026-4444',
  url: 'https://fortiguard.com/psirt/FG-IR-26-001',
  snippet: 'Fortinet confirms exploitation of CVE-2026-4444 in FortiWeb.',
  publisher: 'Fortiguard',
  tier: 1,
  vendorResearch: false,
  publishedDate: new Date().toISOString().slice(0, 10),
  ...over,
});

const article = (over: Record<string, unknown> = {}) => ({
  slug: 'some-article',
  title: 'Some article',
  primaryKeyword: 'some product',
  cves: [] as string[],
  category: 'vulnerabilities',
  publishedAt: '2026-08-01',
  ...over,
});

function build(opts: {
  results?: SearchResult[];
  primary?: SearchResult[];
  covered?: ReturnType<typeof article>[];
  model?: unknown;
  modelRejects?: unknown;
  searchImpl?: jest.Mock;
  searchAlwaysFails?: boolean;
} = {}) {
  const fail = () => Promise.reject(new Error('tavily down'));
  const search = {
    search: opts.searchAlwaysFails
      ? jest.fn().mockImplementation(fail)
      : (opts.searchImpl ?? jest.fn().mockResolvedValue(opts.results ?? [])),
    searchPrimary: opts.searchAlwaysFails
      ? jest.fn().mockImplementation(fail)
      : jest.fn().mockResolvedValue(opts.primary ?? []),
  } as unknown as WebSearchService;

  const json = opts.modelRejects
    ? jest.fn().mockRejectedValue(opts.modelRejects)
    : jest.fn().mockResolvedValue({
        value: opts.model ?? { suggestions: [] },
        usage: { inputTokens: 0, outputTokens: 0 },
      });
  const deepseek = { json } as unknown as DeepSeekService;

  const findMany = jest.fn().mockResolvedValue(opts.covered ?? []);
  const prisma = { article: { findMany } } as unknown as PrismaService;

  const prompts = {
    preamble: () => 'PREAMBLE',
    doc: () => 'SOURCES DOC',
  } as unknown as PromptsService;

  return {
    svc: new TopicSuggesterService(prisma, search, deepseek, prompts),
    search,
    json,
    findMany,
  };
}

/** The user message of the single model call. */
const userPromptOf = (json: jest.Mock): string => json.mock.calls[0][2] as string;

const suggestion = (over: Record<string, unknown> = {}) => ({
  topic: 'Fortinet FortiWeb path traversal exploited in the wild',
  primaryKeyword: 'fortinet fortiweb',
  category: 'vulnerabilities',
  why: 'Exploitation confirmed by the vendor this week and no patch for 7.4.x yet.',
  sourceIndexes: [1],
  ...over,
});

describe('TopicSuggesterService.suggest', () => {
  describe('the CVE exclusion runs in code, before the model', () => {
    it('never calls the model when every candidate is already covered', async () => {
      const { svc, json } = build({
        results: [result()],
        covered: [article({ cves: ['CVE-2026-4444'] })],
      });

      const res = await svc.suggest();

      expect(json).not.toHaveBeenCalled();
      expect(res.suggestions).toEqual([]);
      expect(res.excludedCount).toBe(1);
      expect(res.note).toMatch(/already covered/i);
    });

    it('matches a covered CVE case-insensitively', async () => {
      const { svc, json } = build({
        results: [result({ snippet: 'Tracked as cve-2026-4444.', title: 'A flaw' })],
        covered: [article({ cves: ['CVE-2026-4444'] })],
      });

      await svc.suggest();
      expect(json).not.toHaveBeenCalled();
    });

    it('distinguishes a quiet week from an all-covered week in the note', async () => {
      const { svc } = build({ results: [] });
      const res = await svc.suggest();

      expect(res.excludedCount).toBe(0);
      expect(res.note).toMatch(/no sourceable security stories/i);
    });
  });

  describe('sources are resolved from indexes, never from the model', () => {
    it('resolves an index to the URL the search returned', async () => {
      const two = result({ url: 'https://cisa.gov/advisory/two', title: 'Second story' });
      const { svc, json } = build({
        results: [result({ title: 'First story', snippet: 'no identifier here' }), two],
        model: { suggestions: [suggestion({ sourceIndexes: [2] })] },
      });

      const res = await svc.suggest();

      expect(res.suggestions[0].sources).toEqual([
        { title: 'Second story', url: two.url, publisher: 'Fortiguard', tier: 1 },
      ]);
    });

    it('puts numbered candidates but no URL in the prompt', async () => {
      const { svc, json } = build({
        results: [
          result({ title: 'First story', snippet: 'no identifier' }),
          result({ url: 'https://cisa.gov/two', title: 'Second story', snippet: 'none' }),
        ],
        model: { suggestions: [suggestion()] },
      });

      await svc.suggest();
      const prompt = userPromptOf(json);

      expect(prompt).toContain('[1]');
      expect(prompt).toContain('[2]');
      expect(prompt).not.toContain('http');
    });

    it('drops a suggestion whose indexes resolve to nothing, keeping its siblings', async () => {
      const { svc } = build({
        results: [result({ snippet: 'no identifier' })],
        model: {
          suggestions: [suggestion(), suggestion({ sourceIndexes: [9] })],
        },
      });

      const res = await svc.suggest();
      expect(res.suggestions).toHaveLength(1);
    });

    it('treats every suggestion missing as a retryable failure, not a quiet week', async () => {
      const { svc } = build({
        results: [result({ snippet: 'no identifier' })],
        model: { suggestions: [suggestion({ sourceIndexes: [9] })] },
      });

      await expect(svc.suggest()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('reads CVEs out of the search text, never out of the model prose', async () => {
      const { svc } = build({
        results: [
          result({ title: 'A flaw', snippet: 'Tracked as CVE-2026-1111 by the vendor.' }),
        ],
        model: {
          suggestions: [
            suggestion({
              topic: 'A flaw exploited in the wild',
              why: 'Invented identifier CVE-2026-9999 appears only here, in model prose.',
            }),
          ],
        },
      });

      const res = await svc.suggest();

      expect(res.suggestions[0].cves).toEqual(['CVE-2026-1111']);
    });

    it('flags a suggestion resting only on Tier 2 sources', async () => {
      const { svc } = build({
        results: [result({ tier: 2, publisher: 'BleepingComputer', snippet: 'none' })],
        model: { suggestions: [suggestion()] },
      });

      const res = await svc.suggest();
      expect(res.suggestions[0].hasPrimarySource).toBe(false);
    });
  });

  describe('what reaches the prompt', () => {
    it('drops Tier 3 candidates outright', async () => {
      const { svc, json } = build({
        results: [
          result({ snippet: 'none' }),
          result({
            url: 'https://aggregator.test/story',
            title: 'AGGREGATOR STORY',
            publisher: 'Aggregator',
            tier: 3,
            snippet: 'none',
          }),
        ],
        model: { suggestions: [suggestion()] },
      });

      await svc.suggest();
      expect(userPromptOf(json)).not.toContain('AGGREGATOR STORY');
    });

    it('selects coverage without tags or secondary keywords', async () => {
      const { svc, findMany } = build({ results: [result({ snippet: 'none' })] });
      await svc.suggest();

      const select = findMany.mock.calls[0][0].select;
      expect(select).not.toHaveProperty('tags');
      expect(select).not.toHaveProperty('secondaryKeywords');
      expect(select).toHaveProperty('primaryKeyword', true);
    });

    it('counts drafts as covered', async () => {
      const { svc, findMany } = build({ results: [result({ snippet: 'none' })] });
      await svc.suggest();

      expect(findMany.mock.calls[0][0].where.status.in).toContain('draft');
    });

    it('renders the library as one line per article', async () => {
      const { svc, json } = build({
        results: [result({ snippet: 'none' })],
        covered: [article({ primaryKeyword: 'teamcity rce', cves: ['CVE-2026-63077'] })],
        model: { suggestions: [suggestion()] },
      });

      await svc.suggest();
      expect(userPromptOf(json)).toContain('teamcity rce | CVE-2026-63077');
    });
  });

  describe('search fan-out', () => {
    it('uses the queries for the requested beat, inside the week window', async () => {
      const { svc, search } = build({ results: [result({ snippet: 'none' })] });
      await svc.suggest({ category: 'ransomware' });

      const queries = (search.search as jest.Mock).mock.calls.map((c) => c[0]);
      expect(queries).toContain('ransomware attack claims victim leak site');
      expect((search.search as jest.Mock).mock.calls[0][1]).toEqual({ days: 7 });
    });

    it('widens the window when the week was quiet', async () => {
      const { svc, search } = build({ results: [result({ snippet: 'none' })] });
      await svc.suggest();

      const windows = (search.search as jest.Mock).mock.calls.map((c) => c[1].days);
      expect(windows).toContain(21);
    });

    it('does not widen when the week already produced enough', async () => {
      const many = Array.from({ length: 8 }, (_, i) =>
        result({
          url: `https://cisa.gov/advisory/${i}`,
          title: `Story ${i}`,
          publisher: `Publisher ${i}`,
          snippet: 'none',
        }),
      );
      const { svc, search } = build({ results: many, model: { suggestions: [suggestion()] } });
      await svc.suggest();

      const windows = (search.search as jest.Mock).mock.calls.map((c) => c[1].days);
      expect(windows).not.toContain(21);
    });

    it('drops a dated result older than the window', async () => {
      const { svc, json } = build({
        results: [result({ snippet: 'none' })],
        primary: [
          result({
            url: 'https://vendor.test/old',
            title: 'STALE ADVISORY',
            publishedDate: '2024-01-01',
          }),
        ],
        model: { suggestions: [suggestion()] },
      });

      await svc.suggest();
      expect(userPromptOf(json)).not.toContain('STALE ADVISORY');
    });

    it('keeps an undated result — vendor advisories often carry no date', async () => {
      const { svc, json } = build({
        results: [result({ snippet: 'none' })],
        primary: [
          result({
            url: 'https://vendor.test/psirt',
            title: 'UNDATED ADVISORY',
            publisher: 'Vendor PSIRT',
            publishedDate: null,
          }),
        ],
        model: { suggestions: [suggestion()] },
      });

      await svc.suggest();
      expect(userPromptOf(json)).toContain('UNDATED ADVISORY');
    });

    it('survives one failing query', async () => {
      const searchImpl = jest
        .fn()
        .mockRejectedValueOnce(new Error('tavily 500'))
        .mockResolvedValue([result({ snippet: 'none' })]);

      const { svc } = build({ searchImpl, model: { suggestions: [suggestion()] } });
      await expect(svc.suggest()).resolves.toHaveProperty('suggestions');
    });

    it('reports an outage when every query fails', async () => {
      const { svc, json } = build({ searchAlwaysFails: true });

      await expect(svc.suggest()).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(json).not.toHaveBeenCalled();
    });
  });

  describe('model failures', () => {
    it('turns a refusal into a 422, because retrying changes nothing', async () => {
      const { svc } = build({
        results: [result({ snippet: 'none' })],
        modelRejects: new RefusalError('declined'),
      });

      await expect(svc.suggest()).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('turns unreadable output into a 503, because retrying often works', async () => {
      const { svc } = build({
        results: [result({ snippet: 'none' })],
        modelRejects: new OutputValidationError('bad json'),
      });

      await expect(svc.suggest()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('accepts an empty list from the model as a real answer', async () => {
      const { svc } = build({
        results: [result({ snippet: 'none' })],
        model: { suggestions: [] },
      });

      const res = await svc.suggest();
      expect(res.suggestions).toEqual([]);
      expect(res.note).toBeDefined();
    });
  });
});
