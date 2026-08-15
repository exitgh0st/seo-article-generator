/**
 * Ceilings on outbound fetching.
 *
 * These were part of a larger set bounding the in-app agent's tool loop — round
 * counts, token budgets, search result sizes, chat history windows. That agent is
 * gone and so are those; what remains is what the publish preflight needs when it
 * checks that every source URL in an article still resolves.
 */
export const FETCH_LIMITS = {
  /** Characters of extracted page text retained from a single fetch. */
  maxFetchChars: 12_000,
  /** Milliseconds before a single outbound page fetch is abandoned. */
  fetchTimeoutMs: 20_000,
} as const;

/**
 * Publication gate. Mirrors docs/seo-checklist.md: a passing audit is 12 or
 * higher with no failure on a required row.
 */
export const PUBLISH_LIMITS = {
  minSeoScore: 12,
  minSources: 3,
} as const;
