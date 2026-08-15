/**
 * Production.
 *
 * The app builds to static files, so there is no server of its own to proxy
 * `/api` through — the browser calls the API cross-origin, by absolute URL.
 *
 * Two things must agree with whatever is set here:
 *
 * - The API's `ORIGIN` allowlist must contain the static site's origin, or every
 *   request fails CORS.
 * - No trailing slash. `ApiContentSource` and `AuthService` append `/api/...`.
 *
 * `sitemap.xml`, `rss.xml` and `robots.txt` are served from this origin too —
 * the API keeps them at its root rather than under `/api`.
 */
export const environment = {
  production: true,
  apiUrl: 'https://seo-article-generator-yuf6.onrender.com',
};
