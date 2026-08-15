/**
 * The domain lists from docs/sources.md, as data.
 *
 * Used for two things: constraining a search to primary sources, and tiering a
 * result automatically so the model is not left to guess whether cisa.gov is
 * Tier 1. Guessing is exactly where a Tier 3 aggregator gets cited as though it
 * were an advisory.
 *
 * docs/sources.md is the source of truth for the policy. This file must be kept
 * in step with it — an unlisted domain is treated as Tier 3, which is the safe
 * default because Tier 3 can never be the sole support for a claim.
 */

/** Tier 1 — the organization with direct knowledge. */
export const TIER_1_DOMAINS = [
  // Vendor advisories (PSIRT)
  'msrc.microsoft.com',
  'sec.cloudapps.cisco.com',
  'fortiguard.com',
  'psirt.global.sonicwall.com',
  'forums.ivanti.com',
  'support.citrix.com',
  'support.broadcom.com',
  'security.paloaltonetworks.com',
  'confluence.atlassian.com',
  'oracle.com',
  'helpx.adobe.com',
  'support.apple.com',
  'chromereleases.googleblog.com',
  'ptc.com',

  // Government and coordinating bodies
  'cisa.gov',
  // Joint advisories are co-published, and the CISA copy is not always the one a
  // search surfaces. AA26-222A (#StopRansomware: Gunra) was reachable on the FBI
  // and DoD mirrors when cisa.gov was not, and without these the run failed the
  // primary-source gate on a six-agency government advisory.
  'ic3.gov',
  'defense.gov',
  'fbi.gov',
  'nsa.gov',
  'nvd.nist.gov',
  'cve.org',
  'kb.cert.org',
  'ncsc.gov.uk',
  'cyber.gov.au',
  'enisa.europa.eu',
  'sec.gov',
  'oag.ca.gov',
  'apps.web.maine.gov',

  // Vendor threat research — primary telemetry, never neutral.
  'cloud.google.com',
  'mandiant.com',
  'blog.talosintelligence.com',
  'microsoft.com',
  'unit42.paloaltonetworks.com',
  'crowdstrike.com',
  'recordedfuture.com',
  'arcticwolf.com',
  'huntress.com',
  'rapid7.com',
  'labs.watchtowr.com',
  'volexity.com',
  'welivesecurity.com',
  'securelist.com',
  'news.sophos.com',
  'trendmicro.com',
  'zerodayinitiative.com',
  'research.checkpoint.com',
  'wiz.io',
  'bishopfox.com',
  'fortra.com',
  'shadowserver.org',
  'censys.io',
  'shodan.io',
  'tenable.com',
] as const;

/**
 * First-party advisories that do not live on a domain anyone can enumerate.
 *
 * The domain lists above can only ever cover vendors someone remembered, and a
 * vendor advisory lives on the vendor's own site. GitHub Security Advisories are
 * the standard location for open-source disclosures — CVE-2026-72898 was
 * published as GHSA-vwf4-m7j8-wcjf and would otherwise tier as 3, the same as a
 * content farm. Matching on the path is a structural rule rather than another
 * brand to maintain.
 */
const TIER_1_PATH_PATTERNS: { host: string; path: RegExp }[] = [
  { host: 'github.com', path: /\/security\/advisories\/GHSA-/i },
];

/** Tier 2 — independent security journalism with a corrections record. */
export const TIER_2_DOMAINS = [
  'bleepingcomputer.com',
  'thehackernews.com',
  'krebsonsecurity.com',
  'darkreading.com',
  'therecord.media',
  'securityweek.com',
  'arstechnica.com',
  'theregister.com',
  'cyberscoop.com',
  'risky.biz',
  'isc.sans.edu',
] as const;

/**
 * Vendor research domains. These are Tier 1 by sourcing quality but carry a
 * commercial interest in the threat sounding urgent, so docs/sources.md requires
 * in-text attribution ("according to research from Arctic Wolf"). The flag is set
 * here rather than left to the model to recognise the brands.
 */
export const VENDOR_RESEARCH_DOMAINS = new Set([
  'cloud.google.com',
  'mandiant.com',
  'blog.talosintelligence.com',
  'unit42.paloaltonetworks.com',
  'crowdstrike.com',
  'recordedfuture.com',
  'arcticwolf.com',
  'huntress.com',
  'rapid7.com',
  'labs.watchtowr.com',
  'volexity.com',
  'welivesecurity.com',
  'securelist.com',
  'news.sophos.com',
  'trendmicro.com',
  'zerodayinitiative.com',
  'research.checkpoint.com',
  'wiz.io',
  'bishopfox.com',
  'fortra.com',
  'tenable.com',
]);

export type SourceTier = 1 | 2 | 3;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function matches(host: string, domains: readonly string[]): boolean {
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Tiers a URL by domain. Anything unlisted is Tier 3 — leads only. */
export function tierFor(url: string): SourceTier {
  const host = hostOf(url);
  if (!host) return 3;
  if (matches(host, TIER_1_DOMAINS)) return 1;
  if (matchesTier1Path(url, host)) return 1;
  if (matches(host, TIER_2_DOMAINS)) return 2;
  return 3;
}

function matchesTier1Path(url: string, host: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }
  return TIER_1_PATH_PATTERNS.some(
    (p) => (host === p.host || host.endsWith(`.${p.host}`)) && p.path.test(pathname),
  );
}

/** True when docs/sources.md requires in-text attribution of the vendor's interest. */
export function isVendorResearch(url: string): boolean {
  const host = hostOf(url);
  return [...VENDOR_RESEARCH_DOMAINS].some(
    (d) => host === d || host.endsWith(`.${d}`),
  );
}

/** A readable publisher name from the host, for when a result carries none. */
export function publisherFor(url: string): string {
  const host = hostOf(url);
  if (!host) return 'Unknown';
  const parts = host.split('.');
  const name = parts.length > 2 ? parts[parts.length - 2] : parts[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}
