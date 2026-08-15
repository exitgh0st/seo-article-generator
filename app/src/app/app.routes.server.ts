import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Public routes are server-rendered per request. Admin is client-rendered: it
 * shows drafts, so it must never be crawlable.
 *
 * These were previously RenderMode.Prerender, driven by getPrerenderParams over
 * the build-time content index. That stopped being possible once articles moved
 * into Postgres — prerendering freezes the article list at build time, so
 * anything published afterwards would 404 until the next deploy. Server rendering
 * still emits complete HTML for crawlers, and publication takes effect
 * immediately.
 */
export const serverRoutes: ServerRoute[] = [
  { path: 'login', renderMode: RenderMode.Client },
  { path: 'admin', renderMode: RenderMode.Client },
  { path: 'admin/**', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Server },
];
