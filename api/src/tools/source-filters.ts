/**
 * Rules about the shape of a URL and the shape of a CVE identifier.
 *
 * Both of these started as private functions inside research.stage.ts, which is
 * where the only caller was. They are neither about research nor about a stage —
 * they are the same string-level judgements any component that reads search
 * results has to make — and the topic suggester needs both. A service importing
 * from a pipeline stage to reach a regex is backwards, so they live here, next to
 * the search and fetch services whose output they filter.
 */

/** Domains that are never a citable source, however good the result looks. */
const NOT_A_SOURCE_HOSTS = [
  'instagram.com',
  'facebook.com',
  'linkedin.com',
  'x.com',
  'twitter.com',
  'tiktok.com',
  'youtube.com',
  'reddit.com',
  'pinterest.com',
  'medium.com',
];

export function isNotASource(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (NOT_A_SOURCE_HOSTS.some((d) => host === d || host.endsWith(`.${d}`))) {
    return true;
  }

  // Search and archive pages fetch fine and contain a dozen unrelated headlines,
  // which is worse than a failed fetch: the text looks like evidence.
  if (/\/(search|tag|tags|category|categories|page|archive)(\/|$)/i.test(parsed.pathname)) {
    return true;
  }
  if (
    parsed.searchParams.has('updated-max') ||
    parsed.searchParams.has('max-results') ||
    parsed.searchParams.has('items_per_page')
  ) {
    return true;
  }

  // Aggregated catalogues, which are the same problem one level up: they fetch
  // cleanly and are wall-to-wall CVE identifiers for unrelated products. One
  // Adobe Commerce brief came back carrying 33 CVEs, 31 of them inherited from
  // CISA's weekly vulnerability bulletin and the KEV catalogue index. A
  // catalogue is a lookup table, not reporting about this story, and an article
  // anchored on one is not anchored on anything.
  //
  // Only the indexes. An individual advisory under /news-events/ics-advisories/
  // or /advisories/ is exactly the Tier 1 primary source this beat wants.
  if (
    /\/news-events\/bulletins\//i.test(parsed.pathname) ||
    /\/known-exploited-vulnerabilities-catalog\/?$/i.test(parsed.pathname)
  ) {
    return true;
  }

  return false;
}

/** Every CVE identifier in the text, uppercased and deduplicated. */
export function extractCves(text: string): string[] {
  return [
    ...new Set((text.match(/\bCVE-\d{4}-\d{4,}\b/gi) ?? []).map((c) => c.toUpperCase())),
  ];
}
