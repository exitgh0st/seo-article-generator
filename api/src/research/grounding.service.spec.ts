import { GroundingService } from './grounding.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * The grounding gate decides whether an article may be saved, so its two hard
 * blocks — unsourced CVE identifiers and unsourced indicators of compromise —
 * need to hold under the specific inputs this beat produces.
 *
 * The load-bearing case is the last one: `7.2.63.2` is a real Progress
 * LoadMaster build number and is indistinguishable from a dotted quad. It must
 * never block a save, or the first genuine version number in an article trains
 * the operator to bypass the check.
 */

function serviceWith(sources: { url: string; publisher: string; rawContent: string }[]) {
  const prisma = {
    researchSource: { findMany: jest.fn().mockResolvedValue(sources) },
  } as unknown as PrismaService;
  return new GroundingService(prisma);
}

const source = (rawContent: string, publisher = 'Rapid7') => ({
  url: `https://example.test/${publisher.toLowerCase()}`,
  publisher,
  rawContent,
});

describe('GroundingService.check', () => {
  describe('CVE identifiers', () => {
    it('grounds a CVE present in a source', async () => {
      const svc = serviceWith([source('Tracked as CVE-2026-18577, the flaw ...')]);
      const report = await svc.check('brief-1', {}, 'The bug is CVE-2026-18577.');
      expect(report.unsourcedCves).toEqual([]);
      expect(report.groundedCves).toEqual([
        { cve: 'CVE-2026-18577', sources: ['Rapid7'] },
      ]);
    });

    it('flags a CVE that appears in no source', async () => {
      const svc = serviceWith([source('An unrelated advisory.')]);
      const report = await svc.check('brief-1', {}, 'The bug is CVE-2026-99999.');
      expect(report.unsourcedCves).toEqual(['CVE-2026-99999']);
    });

    it('reads CVEs out of frontmatter as well as prose', async () => {
      const svc = serviceWith([source('nothing relevant')]);
      const report = await svc.check('brief-1', { cves: ['CVE-2026-11111'] }, 'Body.');
      expect(report.unsourcedCves).toEqual(['CVE-2026-11111']);
    });
  });

  describe('indicators of compromise', () => {
    it('blocks a defanged IP that appears in no source', async () => {
      const svc = serviceWith([source('No addresses here.')]);
      const report = await svc.check('brief-1', {}, 'IOC: 192.42.116[.]58');
      expect(report.unsourcedIndicators).toEqual(['192.42.116[.]58']);
    });

    it('grounds a defanged IP against a source that prints it plainly', async () => {
      const svc = serviceWith([source('Traffic came from 192.42.116.58 over ...')]);
      const report = await svc.check('brief-1', {}, 'IOC: 192.42.116[.]58');
      expect(report.unsourcedIndicators).toEqual([]);
      expect(report.groundedIndicators).toEqual([
        { indicator: '192.42.116[.]58', sources: ['Rapid7'] },
      ]);
    });

    it('grounds a fully defanged IP against a plain source', async () => {
      const svc = serviceWith([source('from 10.1.2.3 repeatedly')]);
      const report = await svc.check('brief-1', {}, 'Seen from 10[.]1[.]2[.]3 today.');
      expect(report.unsourcedIndicators).toEqual([]);
    });

    it('blocks an unsourced SHA-256 hash', async () => {
      const hash = 'a'.repeat(64);
      const svc = serviceWith([source('No hashes.')]);
      const report = await svc.check('brief-1', {}, `Sample: ${hash}`);
      expect(report.unsourcedIndicators).toEqual([hash]);
    });

    it('matches a hash case-insensitively', async () => {
      const hash = 'ABCDEF0123456789'.repeat(4); // 64 chars
      const svc = serviceWith([source(`digest ${hash.toLowerCase()} observed`)]);
      const report = await svc.check('brief-1', {}, `Sample: ${hash}`);
      expect(report.unsourcedIndicators).toEqual([]);
    });

    it('finds indicators inside fenced code blocks', async () => {
      const svc = serviceWith([source('nothing')]);
      const body = ['Indicators:', '', '```', '203.0.113[.]7', '```'].join('\n');
      const report = await svc.check('brief-1', {}, body);
      expect(report.unsourcedIndicators).toEqual(['203.0.113[.]7']);
    });
  });

  describe('plain dotted quads stay warnings', () => {
    it('does not block a version number that looks like an IP', async () => {
      const svc = serviceWith([source('Fixed in an unrelated build.')]);
      const report = await svc.check('brief-1', {}, 'Upgrade to 7.2.63.2 or later.');
      expect(report.unsourcedIndicators).toEqual([]);
      expect(report.warnings.some((w) => w.includes('7.2.63.2'))).toBe(true);
    });

    it('warns on an unsourced plain address without blocking', async () => {
      const svc = serviceWith([source('No addresses here.')]);
      const report = await svc.check('brief-1', {}, 'Traffic from 173.249.252.200 was seen.');
      expect(report.unsourcedIndicators).toEqual([]);
      expect(report.warnings.some((w) => w.includes('173.249.252.200'))).toBe(true);
    });

    it('ignores a dotted build number whose leading part exceeds an octet', async () => {
      const svc = serviceWith([source('nothing')]);
      const report = await svc.check('brief-1', {}, 'Hotfix 2 is 2026.3.1.10 exactly.');
      expect(report.unsourcedIndicators).toEqual([]);
      expect(report.warnings.some((w) => w.includes('reads as an IP address'))).toBe(false);
    });

    it('stays quiet when the address is present in a source', async () => {
      const svc = serviceWith([source('Origin 198.51.100.9 was blocked.')]);
      const report = await svc.check('brief-1', {}, 'Origin 198.51.100.9 was blocked.');
      expect(report.warnings.some((w) => w.includes('198.51.100.9'))).toBe(false);
    });
  });

  describe('sources with no retained text', () => {
    it('reports the gap rather than failing every claim', async () => {
      const svc = serviceWith([source('')]);
      const report = await svc.check('brief-1', {}, 'CVE-2026-18577 and 192.42.116[.]58.');
      expect(report.unsourcedCves).toEqual([]);
      expect(report.unsourcedIndicators).toEqual([]);
      expect(report.warnings[0]).toMatch(/has retained page text/i);
    });
  });
});
