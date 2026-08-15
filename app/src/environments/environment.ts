/**
 * Development. The browser talks to a same-origin `/api`, which proxy.conf.json
 * forwards to the Nest API on :3000.
 *
 * `environment.prod.ts` replaces this at build time via the fileReplacements in
 * angular.json, and works the same way: same-origin, with the SSR server
 * proxying to API_URL.
 */
export const environment = {
  production: false,
  /** Same-origin in the browser. Empty means "no prefix", not "no API". */
  apiUrl: '',
};
