# Deployment and handover

How to get this in front of a client, and how they operate it once it's there.

---

## The shape of the thing

Three processes and one unusual requirement.

| Piece | What it is | Where it runs |
|---|---|---|
| Postgres | Articles, briefs, retained source text | Managed database, or a container with a volume |
| `api/` | NestJS on :3000 — storage, scoring, grounding, publishing | Server |
| `app/` | Angular SSR on :4000 — the public site and the review screens | Server |
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

**And then `angular.json` → `security.allowedHosts`.** This one is a trap: if the
serving host is not in that list, SSR silently falls back to client rendering and
every meta tag, canonical URL and piece of JSON-LD disappears from what crawlers
see. The site will look completely fine in a browser. For an SEO product that is
the worst possible failure, because nothing surfaces it.

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
ORIGIN=https://theclientdomain.com        # CORS allowlist
SITE_ORIGIN=https://theclientdomain.com   # canonical URLs, sitemap, rss
CONTENT_DIR=/var/lib/cyberbrief/content   # only if you mounted a volume
NODE_ENV=production
```

The app process needs one variable, and it is in no `.env` file because it
belongs to the Node server rather than the API:

```bash
API_URL=http://127.0.0.1:3000   # where the SSR server proxies /api
PORT=4000
```

There are no model or search API keys anywhere. If you find `DEEPSEEK_API_KEY` or
`TAVILY_API_KEY` in a config you are looking at a stale copy.

---

## Deploying

```bash
npm ci --prefix api && npm ci --prefix app
npm --prefix api run build
npm --prefix app run build
npm --prefix api run migrate:deploy     # never `migrate dev` in production
npm --prefix api run start:prod         # :3000
npm --prefix app run serve:ssr:app      # :4000, proxies /api to API_URL
```

Put a reverse proxy in front of :4000 terminating TLS. Do **not** expose :3000
publicly — the SSR server proxies everything the browser needs, and the API's
write endpoints are behind a single shared password.

Run both processes under something that restarts them (systemd, PM2, a container
runtime). `GET /api/health` returns database connectivity and is a working
readiness probe.

**Still missing, if you want them:** there is no Dockerfile, no compose file that
runs all three services, and no CI. `api/docker-compose.yml` starts Postgres
only, on port 5433, and is a development convenience. I can build these — say the
word.

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
