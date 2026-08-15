import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');
const apiUrl = (process.env['API_URL'] ?? 'http://localhost:3000').replace(/\/$/, '');

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * Forward the API and the crawler-facing files to the Nest API.
 *
 * In a deployment these are usually routed by whatever sits in front of both
 * processes, but forwarding here means `npm run serve:ssr:app` is a complete,
 * working site on one port rather than something that only half works without a
 * proxy in front of it. sitemap.xml and rss.xml used to be static files emitted
 * into public/ by the build script; they are generated per request now, because
 * publishing no longer involves a rebuild.
 */
const FORWARDED = ['/api', '/sitemap.xml', '/rss.xml', '/robots.txt'];

app.use(async (req, res, next) => {
  if (!FORWARDED.some((p) => req.path === p || req.path.startsWith(`${p}/`))) {
    return next();
  }

  try {
    const upstream = await fetch(`${apiUrl}${req.originalUrl}`, {
      method: req.method,
      headers: {
        ...(req.headers as Record<string, string>),
        host: new URL(apiUrl).host,
      },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
      // Node needs this to stream a request body.
      duplex: 'half',
      redirect: 'manual',
    } as RequestInit);

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (key !== 'content-encoding' && key !== 'content-length') {
        res.setHeader(key, value);
      }
    });
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    res.status(502).json({ message: `API at ${apiUrl} is not reachable.` });
  }
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then(async (response) => {
      if (!response) return next();

      // Article routes are server-rendered now rather than prerendered, so every
      // /article/<anything> URL renders successfully and would answer 200. A
      // missing article has to carry a real 404, or search engines index an
      // unbounded set of soft-404 pages — the one thing the prerender setup got
      // for free that server rendering does not.
      if (response.status === 200 && isMissingArticle(req.url)) {
        const missing = await articleMissing(req.url);
        if (missing) {
          return writeResponseToNodeResponse(
            new Response(response.body, { status: 404, headers: response.headers }),
            res,
          );
        }
      }

      return writeResponseToNodeResponse(response, res);
    })
    .catch(next);
});

function isMissingArticle(url: string | undefined): boolean {
  return Boolean(url && /^\/article\/[^/?#]+/.test(url));
}

/** Asks the API whether the slug resolves. Only runs on /article/* routes. */
async function articleMissing(url: string): Promise<boolean> {
  const slug = /^\/article\/([^/?#]+)/.exec(url)?.[1];
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return true;
  try {
    const probe = await fetch(`${apiUrl}/api/articles/${slug}`, { method: 'GET' });
    return probe.status === 404;
  } catch {
    // The API being down is a 5xx condition, not a missing page. Leave the
    // response as it is rather than telling a crawler the article is gone.
    return false;
  }
}

/**
 * Start the server if this module is the main entry point.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
    console.log(`Proxying /api, /sitemap.xml, /rss.xml, /robots.txt to ${apiUrl}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
