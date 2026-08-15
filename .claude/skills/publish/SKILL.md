---
name: publish
description: Load an audited article into the database and publish it. Use when the user asks to publish, ship, or go live with an article. Triggers on "publish", "ship it", "make it live", "push the article".
---

# Publish

Promote a reviewed article to `published` and make it live on the site.

## Input

`/publish <slug>` — an article in `content/articles/`.

## Steps

### 1. Set the status

The article must carry `status: review` in its frontmatter, and it only earns that by passing `/seo-audit`. If it still says `draft`, run the audit first — publishing is refused otherwise, and refusing is correct.

Set `updatedAt` to today. **Leave `publishedAt` alone if it is already set** — re-publishing an updated article must not reset its original date. Google treats a changed publication date on existing content as a signal worth distrusting.

### 2. Load it into the database

```bash
npm run import -- --force
```

`--force` because the article almost certainly exists from an earlier import, and without it the row is skipped and the update silently does nothing.

Read the import output. It reports how many sources carried page text — a brief showing `0 with page text` means the sidecar is missing and nothing about the article was verified.

### 3. Publish

```bash
npm run publish -- <slug>
```

This re-runs every gate server-side rather than trusting the audit: status must be `review`, no blocking rubric row, score above the floor, at least three sources, **every source URL fetched live to confirm it still resolves**, and no CVE or indicator of compromise missing from the retained source text.

Run it with `--check` first if you want to see the preflight without publishing.

It refuses rather than warns. A refusal is the system working — read the blockers, fix the cause, run it again. Do not work around it.

On success the article is live and a copy is written back to `content/articles/<slug>.md`, so the published state stays reviewable in git.

### 4. Verify and report

Confirm `/article/<slug>` renders if a server is running, or report the URL it will occupy.

Report: slug, title, score, word count, source count, and the public path.

## Rules

- Never publish an article that hasn't passed an audit.
- Never reset an existing `publishedAt`.
- If a source URL 404s, the article does not ship until the link is replaced or the claim it supported is cut. Dead links in a published article are worse than a delay.
- Never hand-edit `app/public/content/` — it is generated output.
