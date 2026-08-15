# Content API

NestJS backend for the article pipeline: Postgres, the SEO rubric, the editorial
ban list, the grounding gate, and publishing.

## Why this exists

Research and writing happen in Claude Code, driven by the four skills in
`.claude/skills/`. This service owns everything that has to be true regardless of
who or what wrote the article:

- Articles and briefs are stored, versioned and served from Postgres.
- The rubric and the ban list run as code, so a score is measured rather than
  asserted.
- Publication is gated on checks the writer cannot talk its way past.

An earlier build also hosted a DeepSeek agent that drove the same four steps
through a chat UI. It was removed after a three-topic comparison: on matched
briefs with the same audit loop available to both, the Claude Code path scored
14/15 against 12/15, reported source conflicts the agent flattened, and produced
working internal links the agent never once got right. What the agent *was* good
at — searching its own stored page text for specifics the brief had dropped — is
preserved by the `.sources/` sidecar the research skill now writes.

## Running it

```bash
cp .env.example .env
npm run hash:password -- "your-password"   # paste the hash into .env

npm install
npm run db:up                 # Postgres in Docker on :5433
npx prisma migrate deploy
npm run import:content        # load content/*.md into Postgres
npm run start:dev
```

There are no model or search API keys. Swagger is at
`http://localhost:3000/api/docs` outside production.

## Layout

Flat feature folders, matching `budgetwise-api`.

| Path | Contains |
|---|---|
| `src/seo/` | Rubric scorer, frontmatter validation, editorial ban list |
| `src/research/` | Briefs, stored source text, the grounding gate |
| `src/articles/` | Article persistence, scoring on save |
| `src/publish/` | The publish gate and the markdown export |
| `src/tools/` | Page fetch + extraction, SSRF guard, source tiering |
| `src/feeds/` | sitemap.xml, rss.xml, robots.txt |

## The two things that matter

**The editorial documents are the source of truth, not this code.** `docs/*.md`
defines the rules; `src/seo/` is their executable half. Change one and change the
other — never let TypeScript become a second, quietly diverging statement of an
editorial rule.

**Accuracy rules run as code.** `src/research/grounding.service.ts` refuses any
article whose CVE identifiers or indicators of compromise do not appear in the
stored text of a source the research step actually fetched.
`src/publish/publish.service.ts` refuses to publish unless status, score,
blocking rows, source count and live source-URL reachability all pass.

The indicator half of that gate was added after a comparison run in which two
independently written articles published the same six IP addresses as network
IOCs, and not one of those addresses appeared in any of the eight retained
sources. Both passed the CVE check cleanly. A reader blocks an address or hunts a
hash on sight, so an unverifiable indicator is worse than an unverifiable
adjective.

## Scripts

```bash
npm run audit -- <slug> --brief <brief-slug>   # rubric + ban list + grounding, no DB
npm run publish -- <slug>                      # preflight, then publish
npm run brief:export -- <brief-slug>           # database -> content/research/
npm run article:export -- <slug>               # database -> content/articles/
```

`audit` deliberately needs no database: an article is audited before it is
imported, and a check that could not run at that point would not be run at all.

## Tests

```bash
npm test
```

`src/seo/seo-score.spec.ts` is an equivalence test against `scripts/seo-score.mjs`
— an article must not score differently depending on which half of the system
looks at it.

`src/research/grounding.service.spec.ts` covers the accuracy gate, including the
case that decides its design: `7.2.63.2` is a real Progress LoadMaster build and
is indistinguishable from a dotted quad, so plain addresses only ever warn while
defanged ones and hashes block.

`src/tools/ssrf-guard.spec.ts` covers the address filter. Source URLs come from
article frontmatter, so verifying them is a server-side request forgery surface;
the guard resolves hostnames and rejects private ranges, including the cloud
metadata endpoint.
