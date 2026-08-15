/**
 * Development. The browser talks to a same-origin `/api`, which proxy.conf.json
 * forwards to the Nest API on :3000.
 *
 * `environment.prod.ts` replaces this at build time via the fileReplacements in
 * angular.json, and works differently: the production build is static files with
 * no proxy in front of them, so it names the API's origin in full.
 */
export const environment = {
  production: false,
  /** Same-origin in development. Empty means "no prefix", not "no API". */
  apiUrl: '',
};
