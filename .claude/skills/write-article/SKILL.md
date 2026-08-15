---
name: write-article
description: Write an SEO-optimized cybersecurity news article from a research brief. Use when the user asks to write, draft, or generate an article or blog post about a security topic. Triggers on "write an article", "draft a post", "turn this into an article", "generate content about".
---

# Write Article

Turn a research brief into a publication-ready article at `content/articles/<slug>.md`.

## Input

`/write-article <brief-path>` — path to a file in `content/research/`.

`/write-article <topic>` — if no brief exists for the topic, **run the research skill first**. Never write from memory. An article whose facts came from model recall rather than a fetched source is the failure mode this whole pipeline exists to prevent.

## Steps

### 1. Load context

Read, in order:

1. The research brief.
2. `docs/editorial-standards.md` — the ban list and required patterns.
3. `docs/seo-checklist.md` — the rubric you're writing against.
4. `docs/frontmatter-schema.md` — field requirements.

Also list `content/articles/` to find internal-link candidates.

### 1b. Mine the saved sources

Before drafting, list `content/research/<brief>.sources/`. Those files are the pages the research step actually fetched, and they contain more than the brief kept.

The brief is a summary, so it drops the things that make an article concrete: the vulnerable function name, the exact endpoint path, the class in the deserialization chain, the filename a proof-of-concept writes, the version at which a plugin stops needing a restart. Grep the sidecar for the mechanism you are about to describe and use what you find, with attribution.

This is also the verification pass. **Any version number, IOC, hash, filename, endpoint, or quoted phrase you are about to write must appear in the sidecar.** Grep for it. Three specific traps:

- **A fact in the brief but not in the sidecar is not verified.** The brief can carry a detail its own sources do not support. Treat the sidecar as the authority and the brief as a convenience.
- **Indicators are the sharpest case.** IP addresses and hashes are acted on directly by the reader, and `npm run audit` blocks on any that cannot be traced. Grep every one before you write it.
- **Do not quote from the brief's paraphrase.** Find the sentence in the sidecar and quote that.

If a detail matters and is not in the sidecar, leave it out and say so in your report.

### 2. Confirm the angle

If the brief proposes multiple angles and the user hasn't picked one, ask. Confirm the primary keyword at the same time — it drives the title, slug, description, and first paragraph, so changing it later means rewriting all four.

### 3. Draft

The body starts at H2 — never write a `# ` heading. The page H1 is rendered from the `headline` frontmatter field (falling back to `title`), and an H1 in the body fails the build.

Follow the structure in `CLAUDE.md`:

**Lede** — the most newsworthy specific fact, one or two sentences. Named actor, specific action, date, attribution. No context, no background, no rhetorical question.

**Nut graf** — by paragraph three. Scale, exposure, exploitation status. Why this reader, today.

**What happened** — timeline and actors. Distinguish confirmed from reported from claimed using verb choice.

**Technical detail** — the mechanism. Include the featured-snippet target here: a question-form H2, then a self-contained 40–60 word paragraph that directly answers it. It must make sense lifted out of the page, so no "as noted above".

**Who's affected** — products, versions, exposure counts with attribution.

**Mitigation** — the reader's to-do list. Patch versions, workarounds, detection guidance, IOCs. The only section in second person.

**What's next** — open questions and what to watch. Never a summary of what was just said.

Target 900–1400 words.

### 4. Fill frontmatter

Per `docs/frontmatter-schema.md`. `status: draft`. `seoScore: 0` — the build script owns that field.

`sources` carries every source you actually used, with tier and access date. Minimum three.

Only list CVEs that appear in a fetched source. Omit `heroImage` entirely rather than inventing an image path.

### 4b. Link out generously, and get internal paths right

**External.** Link the first mention of every advisory, CVE record, KEV alert and research report. Three is the rubric minimum and a low bar — a piece drawing on seven sources should be linking most of them, because linking the primary source is what shows the claim is sourced. Anchor the link on the thing being cited ("JetBrains published its advisory", "Rapid7 Labs' analysis"), never on a bare URL or "this report".

**Internal.** The route is `/article/<slug>` — **singular**. `/articles/<slug>` is a 404 and the rubric will not count it. Only link articles that exist; check `content/articles/` first. Two genuinely relevant links beat four contrived ones.

### 5. Self-check before writing

Run the ten-point list at the end of `docs/editorial-standards.md`, and specifically:

- Grep your own draft for every term in the banned-vocabulary table. Zero hits.
- Check for consecutive paragraphs opening with transition words.
- Confirm there's no summary conclusion.
- Verify every number, date, version, CVE, and quote against the brief.
- Read paragraph lengths as a sequence — is there real variation?

Fix violations before writing the file, not after.

### 5b. Humanize before you save

Run the draft through `.claude/skills/humanizer/SKILL.md` in **embedded mode**,
with `docs/humanize-calibration.md` overriding it wherever the two disagree.

Read the calibration before you start. One of the generic rules inverts on this
beat: the skill treats hedging as filler, and here a hedge is a fact. "Microsoft
said the intrusions were *likely preceded by* exploitation" must not become
"were preceded by". The same goes for version numbers, CVE identifiers, defanged
addresses and anything inside a quote, which pass through byte-for-byte.

Then check what the rewrite did before you keep it:

- Every markdown link is still there, pointing at the same URL. The pass tends to
  treat links as clutter; in a measured run it removed all of them.
- Every CVE and indicator is unchanged.
- The article did not lose a quarter of its length. If it did, it summarised
  rather than edited — run it again.
- No em dashes remain.

The in-app pipeline runs this same step and then re-checks grounding
automatically. Here you are that check.

### 6. Write, then audit before reporting

Write `content/articles/<slug>.md` — filename must match the `slug` field.

Then run the audit and act on it:

```bash
npm --prefix api run audit -- <slug> --brief <brief-slug>
```

Fix what it flags and run it again. Repeat until it exits clean. **Do not report a draft you have not audited** — the mechanical rows (keyword in an H2, a secondary keyword you declared but never used, a word count 9 words short) are exactly what a single writing pass misses, and each one is a thirty-second fix once something has counted it for you.

One row is allowed to stay unfixed: Images, when there genuinely is no image — never invent a path to satisfy a row. That makes 14/15 the working ceiling. Everything else, Readability included, should be green before you report: measured across matched topics this path reaches 14.4–17.7 words per sentence, so a failing readability row is a signal the prose drifted, not a cost of the beat. Fix it by varying sentence length, never by cutting a fact or a hedge.

Then report in chat:

- Word count and a self-assessed rubric score.
- Which sources carried which claims.
- **Anything you deliberately left out** because you couldn't verify it. This matters more than the rest of the report — it tells the user what a competitor might cover that this piece doesn't, and why.
- Internal links used, or a note that no relevant articles exist yet.

Suggest `/seo-audit <slug>` as the next step.

## Rules

- One fact, one source, no exceptions. If the brief says "not stated in sources", the article does not state it.
- Never manufacture a quote, and never paraphrase into quotation marks.
- Never upgrade hedged attribution.
- Date-stamp volatile claims: "as of 2026-08-10, no patch is available".
- Attribute vendor research in-text — "according to research from Arctic Wolf" — because vendors are not neutral parties.
- Where sources conflict, report the conflict rather than picking a side.
