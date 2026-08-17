import { ServiceUnavailableException } from '@nestjs/common';
import { TopicPreflightService, isAbout, significantTerms } from './topic-preflight.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { WebSearchService, SearchResult } from '../tools/web-search.service';
import type { SourceTier } from '../tools/source-tiers';

/**
 * Preflight decides whether the operator is allowed to spend a run, so the tests
 * that matter are the ones about what it refuses. Two verdicts block, and both
 * have to be exactly right: a false block wastes a real story, and a missed block
 * spends a run to rediscover something the library already says.
 *
 * The load-bearing case is `no Tier 1 is a warning, not a block`. Search ranking
 * is a sample rather than the record, research.stage.ts digs harder than this does,
 * and refusing there would refuse topics that write perfectly well.
 */

/**
 * One story runs through most of these tests, and the fixtures name it.
 *
 * They have to: the relevance filter drops any candidate that does not mention the
 * topic's own terms, so a fixture reading "some coverage" is correctly discarded
 * and would make every test about the filter rather than the verdict.
 */
const TOPIC = 'Fortinet FortiWeb path traversal exploited';

const result = (
  over: Partial<SearchResult> & { publisher: string; tier: SourceTier },
): SearchResult => ({
  title: `${over.publisher} on the Fortinet FortiWeb flaw`,
  url: `https://${over.publisher.toLowerCase().replace(/\s/g, '')}.test/story`,
  snippet: 'A path traversal in Fortinet FortiWeb, exploited in the wild.',
  vendorResearch: false,
  publishedDate: '2026-08-17',
  ...over,
});

const article = (over: Partial<Record<string, unknown>> = {}) => ({
  slug: 'adobe-commerce-session-hijack',
  title: 'Adobe Commerce account hijack flaw exploited',
  status: 'published',
  publishedAt: '2026-08-17',
  primaryKeyword: 'adobe commerce',
  cves: ['CVE-2025-54236'],
  ...over,
});

function serviceWith(options: {
  results?: SearchResult[];
  primary?: SearchResult[];
  articles?: ReturnType<typeof article>[];
  searchThrows?: boolean;
}) {
  const prisma = {
    article: { findMany: jest.fn().mockResolvedValue(options.articles ?? []) },
  } as unknown as PrismaService;

  const fail = () => Promise.reject(new Error('tavily down'));
  const search = {
    search: options.searchThrows ? fail : jest.fn().mockResolvedValue(options.results ?? []),
    searchPrimary: options.searchThrows
      ? fail
      : jest.fn().mockResolvedValue(options.primary ?? []),
  } as unknown as WebSearchService;

  return new TopicPreflightService(prisma, search);
}

describe('TopicPreflightService', () => {
  describe('blocks', () => {
    it('reports a topic whose CVE already sits on an article as covered', async () => {
      const svc = serviceWith({ articles: [article()] });
      const report = await svc.check({ topic: 'Something about CVE-2025-54236 exploited' });

      expect(report.verdict).toBe('covered');
      expect(report.blocking).toBe(true);
      expect(report.covered[0].slug).toBe('adobe-commerce-session-hijack');
    });

    it('counts a second article on the same CVE', async () => {
      const svc = serviceWith({
        articles: [article(), article({ slug: 'follow-up', title: 'Follow-up' })],
      });
      const report = await svc.check({ topic: 'CVE-2025-54236 keeps spreading' });
      expect(report.covered).toHaveLength(2);
      expect(report.summary).toMatch(/2 articles/);
    });

    it('counts an unpublished draft as coverage', async () => {
      const svc = serviceWith({ articles: [article({ status: 'draft' })] });
      const report = await svc.check({ topic: 'More on CVE-2025-54236 today' });
      expect(report.verdict).toBe('covered');
    });

    it('spends no search when the topic is already covered', async () => {
      // The verdict is free from the database; confirming it with four Tavily
      // calls is not, and this is the one path where the answer is already known.
      const search = {
        search: jest.fn().mockResolvedValue([]),
        searchPrimary: jest.fn().mockResolvedValue([]),
      } as unknown as WebSearchService;
      const prisma = {
        article: { findMany: jest.fn().mockResolvedValue([article()]) },
      } as unknown as PrismaService;

      await new TopicPreflightService(prisma, search).check({
        topic: 'CVE-2025-54236 again',
      });

      expect(search.search).not.toHaveBeenCalled();
      expect(search.searchPrimary).not.toHaveBeenCalled();
    });

    it('blocks a topic nothing citable came back for', async () => {
      const svc = serviceWith({ results: [], primary: [] });
      const report = await svc.check({ topic: 'asdkjhasd security thing' });

      expect(report.verdict).toBe('unsourceable');
      expect(report.blocking).toBe(true);
      expect(report.candidateCount).toBe(0);
    });

    it('blocks when every candidate is filtered out as not-a-source', async () => {
      const svc = serviceWith({
        results: [
          result({ publisher: 'X', tier: 2, url: 'https://twitter.com/a/status/1' }),
          result({ publisher: 'Reddit', tier: 3, url: 'https://reddit.com/r/x/y' }),
        ],
      });
      const report = await svc.check({ topic: 'a rumour going around today' });
      expect(report.verdict).toBe('unsourceable');
    });
  });

  describe('warns without blocking', () => {
    /**
     * The failure this split exists to avoid. A second LoadMaster CVE is real news
     * and shares a primary keyword with the first one — blocking it would be the
     * pipeline refusing the story rather than the duplicate, which is the exact
     * "stuck with nothing to do" the check is meant to prevent.
     */
    it('warns rather than blocks when only the product has been covered before', async () => {
      const svc = serviceWith({
        articles: [
          article({
            slug: 'fortiweb-first-flaw',
            title: 'Fortinet FortiWeb flaw exploited',
            primaryKeyword: 'fortinet fortiweb',
            cves: ['CVE-2026-11111'],
          }),
        ],
        results: [
          result({ publisher: 'The Hacker News', tier: 2 }),
          result({ publisher: 'SecurityWeek', tier: 2 }),
        ],
        primary: [result({ publisher: 'CISA', tier: 1 })],
      });
      const report = await svc.check({ topic: TOPIC });

      expect(report.verdict).toBe('covered');
      expect(report.blocking).toBe(false);
      expect(report.covered[0].slug).toBe('fortiweb-first-flaw');
      // The sourcing is still reported, because the operator is being asked to
      // judge rather than simply being turned away.
      expect(report.tier1Count).toBe(1);
    });

    it('does not warn on a one-word keyword that matches half the beat', async () => {
      const svc = serviceWith({
        articles: [article({ primaryKeyword: 'ransomware', cves: [] })],
        results: [
          result({ publisher: 'The Hacker News', tier: 2 }),
          result({ publisher: 'SecurityWeek', tier: 2 }),
        ],
        primary: [result({ publisher: 'CISA', tier: 1 })],
      });
      const report = await svc.check({ topic: `${TOPIC} in a ransomware campaign` });

      expect(report.verdict).toBe('ready');
      expect(report.covered).toEqual([]);
    });

    it('treats no primary source as a warning, not a refusal', async () => {
      const svc = serviceWith({
        results: [
          result({ publisher: 'The Hacker News', tier: 2 }),
          result({ publisher: 'SecurityWeek', tier: 2 }),
          result({ publisher: 'BleepingComputer', tier: 2 }),
        ],
      });
      const report = await svc.check({ topic: TOPIC });

      expect(report.verdict).toBe('thin');
      expect(report.blocking).toBe(false);
      expect(report.tier1Count).toBe(0);
      expect(report.summary).toMatch(/primary source/i);
    });

    it('warns when too few publishers are covering it', async () => {
      const svc = serviceWith({
        results: [result({ publisher: 'The Hacker News', tier: 2 })],
        primary: [result({ publisher: 'CISA', tier: 1 })],
      });
      const report = await svc.check({ topic: TOPIC });

      expect(report.verdict).toBe('thin');
      expect(report.blocking).toBe(false);
      expect(report.distinctPublishers).toBe(2);
    });
  });

  describe('passes', () => {
    it('is ready with a primary source and three publishers', async () => {
      const svc = serviceWith({
        results: [
          result({ publisher: 'The Hacker News', tier: 2 }),
          result({ publisher: 'SecurityWeek', tier: 2 }),
        ],
        primary: [result({ publisher: 'CISA', tier: 1 })],
      });
      const report = await svc.check({ topic: TOPIC });

      expect(report.verdict).toBe('ready');
      expect(report.blocking).toBe(false);
      expect(report.tier1Count).toBe(1);
    });

    it('does not credit a CVE in the topic with a synthesised NVD source', async () => {
      // research.stage.ts turns a CVE in the topic into an NVD detail URL. That
      // page is client-rendered and now gets dropped at fetch as a shell, so
      // counting it here would call every CVE-bearing topic ready on the strength
      // of a page that never survives.
      const cveCoverage = (publisher: string) =>
        result({
          publisher,
          tier: 2,
          title: `${publisher} on CVE-2026-99999`,
          snippet: 'CVE-2026-99999 is being exploited.',
        });

      const svc = serviceWith({
        results: [
          cveCoverage('The Hacker News'),
          cveCoverage('SecurityWeek'),
          cveCoverage('BleepingComputer'),
        ],
      });
      const report = await svc.check({ topic: 'CVE-2026-99999 exploited everywhere' });

      expect(report.candidateCount).toBe(3);
      expect(report.tier1Count).toBe(0);
      expect(report.verdict).toBe('thin');
      expect(report.sources.every((s) => !s.url.includes('nvd.nist.gov'))).toBe(true);
    });

    it('caps a single publisher so six results do not read as six sources', async () => {
      const svc = serviceWith({
        results: Array.from({ length: 6 }, (_, i) =>
          result({ publisher: 'SecurityWeek', tier: 2, url: `https://sw.test/${i}` }),
        ),
        primary: [result({ publisher: 'CISA', tier: 1 })],
      });
      const report = await svc.check({ topic: TOPIC });

      expect(report.sources.filter((s) => s.publisher === 'SecurityWeek')).toHaveLength(2);
      expect(report.sources[0].tier).toBe(1);
    });
  });

  describe('relevance', () => {
    /**
     * The measured failure this filter exists for. Before it, "asdkjhasd zzqqwx
     * security thing" came back `ready` on 29 candidates and 11 primary sources:
     * the queries append "vulnerability advisory" and "exploited in the wild" to
     * whatever was typed, so the search answers a question about security in
     * general and every topic looks well sourced.
     */
    it('blocks a nonsense topic that returned generic security coverage', async () => {
      const svc = serviceWith({
        results: [
          result({
            publisher: 'CISA',
            tier: 1,
            title: 'CVEs: how the whole thing works',
            snippet: 'An explainer on vulnerability disclosure and patching.',
          }),
          result({
            publisher: 'Microsoft',
            tier: 1,
            title: 'Vulnerabilities and exploits',
            snippet: 'Threat intelligence on critical security flaws.',
          }),
          result({
            publisher: 'Huntress',
            tier: 1,
            title: 'ClickFix malware buried in images',
            snippet: 'A new attack technique under active exploitation.',
          }),
        ],
      });
      const report = await svc.check({ topic: 'asdkjhasd zzqqwx security thing' });

      expect(report.verdict).toBe('unsourceable');
      expect(report.blocking).toBe(true);
      expect(report.candidateCount).toBe(0);
      // The operator needs to know the search worked and the topic did not.
      expect(report.summary).toMatch(/3 security stories/);
    });

    it('keeps coverage that names the vendor and product', async () => {
      const svc = serviceWith({
        results: [
          result({
            publisher: 'The Hacker News',
            tier: 2,
            title: 'Progress Kemp LoadMaster pre-auth RCE',
            snippet: 'A command injection in Kemp LoadMaster.',
          }),
          result({
            publisher: 'SecurityWeek',
            tier: 2,
            title: 'Unrelated ransomware roundup',
            snippet: 'A different story entirely about a critical flaw.',
          }),
        ],
        primary: [
          result({
            publisher: 'watchTowr',
            tier: 1,
            title: 'Progress Kemp LoadMaster uninitialised heap',
            snippet: 'LoadMaster command injection, exploited.',
          }),
        ],
      });
      const report = await svc.check({
        topic: 'Progress Kemp LoadMaster command injection being exploited',
      });

      expect(report.candidateCount).toBe(2);
      expect(report.sources.every((s) => s.publisher !== 'SecurityWeek')).toBe(true);
    });

    it('accepts a candidate on a CVE match alone', async () => {
      const svc = serviceWith({
        results: [
          result({
            publisher: 'NVD',
            tier: 1,
            title: 'CVE-2026-8037 Detail',
            snippet: 'No product name in this snippet at all.',
          }),
        ],
      });
      const report = await svc.check({ topic: 'CVE-2026-8037 being exploited now' });
      expect(report.candidateCount).toBe(1);
    });
  });

  describe('significantTerms', () => {
    it('drops the vocabulary the queries inject and the beat shares', () => {
      expect(significantTerms('Progress Kemp LoadMaster command injection being exploited')).toEqual(
        ['progress', 'kemp', 'loadmaster', 'command', 'injection'],
      );
    });

    it('keeps three-letter product names', () => {
      expect(significantTerms('Cisco IOS XE web UI flaw')).toEqual(['cisco', 'ios', 'web']);
    });

    it('leaves nothing behind for a topic that says nothing', () => {
      expect(significantTerms('new critical vulnerability exploited in the wild')).toEqual([]);
    });
  });

  describe('isAbout', () => {
    const candidate = (title: string, snippet = '') => ({ title, snippet });

    it('needs two terms when the topic offers two or more', () => {
      const terms = ['fortinet', 'fortiweb'];
      expect(isAbout(candidate('Fortinet FortiWeb path traversal'), terms, [])).toBe(true);
      expect(isAbout(candidate('Fortinet earnings call'), terms, [])).toBe(false);
    });

    it('needs only one when the topic offers only one', () => {
      expect(isAbout(candidate('Metabase SQL injection'), ['metabase'], [])).toBe(true);
    });

    it('rejects everything when the topic has no distinctive terms and no CVE', () => {
      expect(isAbout(candidate('Anything at all'), [], [])).toBe(false);
    });

    it('matches on the snippet as well as the title', () => {
      expect(
        isAbout(candidate('Threat report', 'Covers Cisco IOS devices'), ['cisco', 'ios'], []),
      ).toBe(true);
    });
  });

  describe('a broken provider is not a verdict', () => {
    it('raises 503 rather than reporting the topic unsourceable', async () => {
      const svc = serviceWith({ searchThrows: true });
      await expect(svc.check({ topic: 'a perfectly good topic' })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
