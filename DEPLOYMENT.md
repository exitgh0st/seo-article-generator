# Deployment and handover

How to get this in front of a client, and how they operate it once it's there.

---

## The shape of the thing

Three processes and one unusual requirement.

| Piece | What it is | Where it runs |
|---|---|---|
| Postgres | Articles, briefs, retained source text | Managed database, or a container with a volume |
| `api/` | NestJS on :3000 — storage, scoring, grounding, publishing | Server |
| `app/` | Angular, built to static files — the review screens | Static host or CDN |
| **Claude Code** | Where articles are actually researched and written | **An operator's laptop** |

The unusual part is the last row. **The server contains no model.** It scores,
gates and serves; it does not write. Articles are produced in Claude Code and
loaded in.

That has one hard consequence worth being explicit with the client about:
**whoever writes articles needs Claude Code installed and a Claude subscription.**
The subscription covers interactive use of Claude Code — it is not an API key and
the server never calls Anthropic. If the client wants articles produced without a
person driving Claude Code, that is a different product and needs an Anthropic
API account.

---

## Before you deploy anything

Four things are missing or wrong out of the box. The first is the one that bites.

### 1. Put it in git

```bash
git init && git add -A && git commit -m "Initial commit"
```

`CLAUDE.md` claims published articles stay reviewable in git, and publishing
writes `content/articles/<slug>.md` for exactly that reason. Until there is a
repository, that trail goes nowhere. Confirm `api/.env` is ignored before the
first commit — it holds the JWT secret and the admin password hash.

### 2. Replace the placeholder identity

`https://example.com` appears in three hand-synced places and they must agree:

- `site.config.json` → `origin`
- `app/src/app/core/site.config.ts` → `origin`, and `twitter`
- `api/src/feeds/site-config.service.ts` → the `FALLBACK`

These describe the canonical address articles are published under, which is what
goes into sitemap URLs, canonical tags and JSON-LD. It is not necessarily where
the operator app itself is hosted — see the next section for that.

**And then `app/src/environments/environment.prod.ts` → `apiUrl`.** This one is a
trap: the operator app is static files with no proxy of its own, so if `apiUrl`
does not name the deployed API's origin exactly, the app builds and loads
perfectly and then every screen is empty. Set it, and put the app's own origin in
the API's `ORIGIN` allowlist, or the browser blocks the calls at CORS.

### 3. Decide where `content/` lives

`PublishService` writes `content/articles/<slug>.md` on publish, inside a
try/catch that only warns on failure — on a container with an ephemeral
filesystem, publishing succeeds and the markdown quietly evaporates.

Two honest options:

- **Mount a volume** at `CONTENT_DIR` and keep the git-reviewable trail.
- **Accept the database as sole source of truth**, and tell the client the
  markdown export is a development convenience. Then `npm run article:export`
  becomes the way to get a file back when one is wanted.

Pick one deliberately. The failure mode of not deciding is discovering months
later that the export never worked in production.

### 4. Set the admin password

```bash
npm --prefix api run hash:password -- "a real password"
```

Paste the hash into `ADMIN_PASSWORD_HASH`. Generate `JWT_SECRET` with
`openssl rand -hex 32` — the schema rejects anything under 32 characters at boot.

Auth is a single shared password with a 7-day JWT and no user table. That is
appropriate for one or two operators and inappropriate for a team that will grow;
say so now rather than after the client adds five people. Rotating `JWT_SECRET`
is the only way to invalidate issued tokens.

---

## Environment

Everything the API needs, and nothing more:

```bash
DATABASE_URL=postgresql://user:pass@host:5432/seo_articles?schema=public
JWT_SECRET=<openssl rand -hex 32>
ADMIN_PASSWORD_HASH=<npm run hash:password>
ORIGIN=https://admin.theclientdomain.com  # CORS allowlist — the app's origin
SITE_ORIGIN=https://theclientdomain.com   # canonical URLs, sitemap, rss
CONTENT_DIR=/var/lib/cyberbrief/content   # only if you mounted a volume
NODE_ENV=production
```

`ORIGIN` matters more than it used to. The app no longer proxies through a server
of its own, so every request it makes is cross-origin and this list is the only
thing that lets them through. It splits on commas — include preview deployments
if the host makes them.

The app has no runtime environment at all. It is a directory of files. Its one
piece of configuration, the API's URL, is compiled in from
`app/src/environments/environment.prod.ts`, so **changing it means a rebuild**.

There are no model or search API keys anywhere. If you find `DEEPSEEK_API_KEY` or
`TAVILY_API_KEY` in a config you are looking at a stale copy.

---

## Deploying

Two deployments now, not two processes.

**The API** is the only thing that runs:

```bash
npm ci --prefix api
npm --prefix api run build
npm --prefix api run migrate:deploy     # never `migrate dev` in production
npm --prefix api run start:prod         # :3000
```

**The app** is built once and the resulting directory is uploaded:

```bash
npm ci --prefix app
npm --prefix app run build              # → app/dist/app
```

`render.yaml` at the repo root describes this as a Render static site, including
the one piece of host configuration that is not optional: **a rewrite of `/*` to
`/index.html`**. Angular uses path-based routes, so without it a full page load of
`/admin/<slug>` — or any browser refresh — asks the host for a file that does not
exist and gets a 404, while navigation inside the app looks perfectly fine. That
is how this gets missed until a client reloads the page. Any other static host
needs the same rule under a different name (`_redirects`, `try_files`, a
CloudFront error-page mapping).

**The API must now be publicly reachable over TLS.** This reverses the previous
advice. There is no longer a server in front of it forwarding the browser's
requests — the browser calls it directly, so it needs its own hostname and
certificate. Its write endpoints are still behind the shared password, and
`ORIGIN` still gates which sites may call it at all.

Run the API under something that restarts it (systemd, PM2, a container runtime).
`GET /api/health` returns database connectivity and is a working readiness probe.
The static site needs no supervision — there is no process.

Three consequences of the app being static, worth knowing before someone reports
them as bugs:

- **A missing article answers 200, not 404.** Every path returns the app shell;
  the router then shows the not-found page. Correct on screen, wrong in the
  status line, and unfixable client-side.
- **`sitemap.xml`, `rss.xml` and `robots.txt` live on the API's origin**, not the
  app's. The footer links point there.
- **Nothing the app renders is crawlable.** Meta tags and JSON-LD are written
  after the bundle boots, so a crawler sees an empty shell. This is intended: the
  app is an operator tool, and the articles are published elsewhere.

**Still missing, if you want them:** there is no Dockerfile, no compose file, and
no CI. `api/docker-compose.yml` starts Postgres only, on port 5433, and is a
development convenience. I can build these — say the word.

---

## How the client actually uses it

The workflow, in the order they will do it:

```
1.  /research <topic>              Claude Code  → brief + .sources/ sidecar
2.  /write-article <brief>         Claude Code  → content/articles/<slug>.md
3.  /seo-audit <slug>              Claude Code  → npm run audit, fix, re-audit
4.  npm run import -- --force      loads it into Postgres
5.  review it at /admin/<slug>     the website
6.  npm run publish -- <slug>      preflight, then live
```

Steps 1–3 need Claude Code and the repository checked out locally. Steps 4–6 can
run wherever the database is reachable.

**Three things to tell them plainly:**

**The `.sources/` directory is not clutter.** Research writes the full text of
every page it fetched into `content/research/<brief>.sources/`. That text is what
`npm run audit` and `npm run publish` check CVE identifiers and IP addresses
against. Delete it and the checks stop failing — they start passing without
verifying anything, which is worse.

**A refused publish is the product working.** `npm run publish` re-runs every gate
server-side: status, score, blocking rubric rows, source count, a live fetch of
every source URL, and grounding. It refuses rather than warns. The fix is always
the article, never the gate.

**Publishing is deliberately not in the UI.** The review screens show drafts and
scores; going live is a command. That is not an oversight — it keeps an
irreversible, public action off a button that can be clicked by accident.

---

## What to hand over

- Repository access, with `api/.env` **not** in it — send those secrets separately.
- The admin URL and password.
- `CLAUDE.md` (how the system thinks), `api/README.md` (how the backend works),
  and this file.
- A walkthrough of one real article end to end. Do this live. The workflow is six
  steps and reads as obvious once seen, and reads as intimidating on paper.

## What to tell them about limits

- **One writer at a time.** Single shared password, no user accounts, no
  per-author bylines beyond the frontmatter field.
- **Articles need a person.** Roughly 20–40 minutes of operator time each, most of
  it research. There is no unattended mode.
- **The audit is not a proofreader.** It measures the rubric, scans a fixed ban
  list, and verifies identifiers. It cannot tell whether the lede leads on the
  news or whether a source conflict was flattened — that is what the human
  reading step is for.
- **Anything volatile ages.** Patch status, victim counts and attribution change
  after publication; the editorial standard is to date-stamp them, not to keep
  them current forever.
