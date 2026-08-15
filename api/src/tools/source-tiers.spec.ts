import { tierFor, isVendorResearch } from './source-tiers';

/**
 * The tier table is what decides whether a run can proceed at all: the research
 * stage refuses a topic with no Tier 1 source. A measured run against the
 * ExfilSquad story failed there outright because every source it found tiered as
 * 3, so these cases are the ones that cost a real article.
 */
describe('tierFor', () => {
  it('tiers government and PSIRT domains as 1', () => {
    expect(tierFor('https://www.cisa.gov/known-exploited-vulnerabilities-catalog')).toBe(1);
    expect(tierFor('https://nvd.nist.gov/vuln/detail/CVE-2026-68820')).toBe(1);
    expect(
      tierFor(
        'https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-asaftd-vpn-dos-dzv4mQFF',
      ),
    ).toBe(1);
  });

  it('tiers journalism as 2', () => {
    expect(tierFor('https://thehackernews.com/2026/08/whatever.html')).toBe(2);
    expect(tierFor('https://www.bleepingcomputer.com/news/security/x/')).toBe(2);
  });

  it('tiers an unlisted domain as 3', () => {
    expect(tierFor('https://some-content-farm.example/post')).toBe(3);
  });

  // Each of these carried a primary finding in an August 2026 story and tiered
  // as 3 before being listed, which is the same tier as an aggregator.
  it('tiers the vendor research firms that broke recent stories as 1', () => {
    expect(
      tierFor('https://research.checkpoint.com/2026/shattering-the-dream/'),
    ).toBe(1);
    expect(tierFor('https://www.wiz.io/blog/inside-the-metabase-sqli')).toBe(1);
    expect(tierFor('https://bishopfox.com/blog/critical-sql-injection')).toBe(1);
    expect(tierFor('https://www.fortra.com/blog/whatever')).toBe(1);
  });

  it('flags those firms as vendor research, so attribution stays required', () => {
    expect(isVendorResearch('https://research.checkpoint.com/2026/x/')).toBe(true);
    expect(isVendorResearch('https://www.wiz.io/blog/x')).toBe(true);
    expect(isVendorResearch('https://www.cisa.gov/x')).toBe(false);
  });

  describe('GitHub Security Advisories', () => {
    it('tiers a GHSA page as a first-party advisory', () => {
      expect(
        tierFor(
          'https://github.com/metabase/metabase/security/advisories/GHSA-vwf4-m7j8-wcjf',
        ),
      ).toBe(1);
    });

    it('does not promote the rest of github.com', () => {
      expect(tierFor('https://github.com/metabase/metabase')).toBe(3);
      expect(tierFor('https://github.com/some/repo/issues/42')).toBe(3);
    });
  });
});
