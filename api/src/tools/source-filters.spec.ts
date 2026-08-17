import { isNotASource, extractCves } from './source-filters';

/**
 * The exclusions exist to protect the brief, not the fetch budget. Every URL
 * rejected here is one that fetches perfectly well and returns text that looks
 * like evidence — which is why the list has to be precise in both directions. A
 * catalogue index must go, and the individual advisory sitting one path segment
 * away must stay: it is the Tier 1 primary source the whole beat is anchored on.
 */
describe('isNotASource', () => {
  describe('aggregated catalogues', () => {
    it('rejects CISA weekly vulnerability bulletins', () => {
      expect(
        isNotASource('https://www.cisa.gov/news-events/bulletins/sb26-201'),
      ).toBe(true);
    });

    it('rejects the KEV catalogue index', () => {
      expect(
        isNotASource(
          'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
        ),
      ).toBe(true);
    });

    it('rejects a paginated listing that asks for every row at once', () => {
      expect(
        isNotASource(
          'https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=&items_per_page=All',
        ),
      ).toBe(true);
    });

    it('keeps an individual CISA advisory', () => {
      expect(
        isNotASource(
          'https://www.cisa.gov/news-events/ics-advisories/icsa-26-201-01',
        ),
      ).toBe(false);
    });

    it('keeps a vendor advisory under an /advisories/ path', () => {
      expect(
        isNotASource('https://www.veeam.com/kb4724/advisories/kb4724'),
      ).toBe(false);
    });

    it('keeps an NVD record for a single CVE', () => {
      expect(
        isNotASource('https://nvd.nist.gov/vuln/detail/CVE-2025-54236'),
      ).toBe(false);
    });
  });

  describe('existing exclusions still hold', () => {
    it.each([
      'https://twitter.com/anyone/status/1',
      'https://example.test/search/adobe',
      'https://example.test/tag/ransomware',
      'not a url',
    ])('rejects %s', (url) => {
      expect(isNotASource(url)).toBe(true);
    });

    it('keeps an ordinary news article', () => {
      expect(
        isNotASource(
          'https://thehackernews.com/2025/09/adobe-commerce-flaw-cve-2025-54236-lets.html',
        ),
      ).toBe(false);
    });
  });
});

describe('extractCves', () => {
  it('pulls the identifier out of an NVD detail URL, whatever its case', () => {
    expect(extractCves('https://nvd.nist.gov/vuln/detail/cve-2026-48356')).toEqual(
      ['CVE-2026-48356'],
    );
  });

  it('returns nothing for a URL that names no CVE', () => {
    expect(extractCves('https://www.securityweek.com/adobe-patches/')).toEqual([]);
  });
});
