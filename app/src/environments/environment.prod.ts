/**
 * Production.
 *
 * `apiUrl` is empty on purpose. The SSR server in `src/server.ts` forwards
 * `/api`, `/sitemap.xml`, `/rss.xml` and `/robots.txt` to whatever `API_URL`
 * points at, so the browser only ever talks to its own origin and no deployment
 * URL is committed. Set `API_URL` on the Node process, not here.
 *
 * If you ever serve the API from a different origin than the app, set that
 * absolute URL here and add the origin to the API's `ORIGIN` allowlist for CORS —
 * but prefer the proxy, which keeps cookies and CSP simple.
 */
export const environment = {
  production: true,
  apiUrl: '',
};
