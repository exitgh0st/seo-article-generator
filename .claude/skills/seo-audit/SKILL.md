---
name: seo-audit
description: Score an article against the SEO rubric and editorial ban list, then propose and apply fixes. Use when the user asks to audit, check, score, review, or optimize an article for SEO. Triggers on "seo audit", "check the article", "score this", "optimize for search".
---

# SEO Audit

Score an article against `docs/seo-checklist.md`, flag editorial violations from `docs/editorial-standards.md`, propose fixes, apply on confirmation.

## Input

`/seo-audit <slug>` — an article in `content/articles/`. With no argument, audit every article whose `status` is `draft` or `review`.

## Steps

### 1. Run the scorer

```bash
npm --prefix api run audit -- <slug> --brief <brief-slug>
```

This measures all 15 rubric rows, scans the ban list, and checks every CVE and indicator against the saved source text. It exits non-zero when something blocking is found.

**Run it rather than counting by hand.** Character counts, keyword occurrences, word counts, Flesch scores and link tallies are what a script is for, and a hand count that disagrees with the script is simply wrong — the script is the same code the app uses to gate publication.

Pass `--brief` whenever the article has one. Without it the grounding section is skipped entirely, and skipping is not the same as passing.

### 2. Read the article yourself

The scorer cannot see the things that actually sink an article. Read it and check:

- **Sense, not just strings.** The scan marks `critical` as advisory because it is correct for a CVSS rating, and `leverage` only as a verb. Read the flagged line before changing it — and read for the ones it cannot flag at all.
- **Second person outside the mitigation section.** No script catches this. It is the most common violation in practice.
- **Flattened confidence.** Confirmed, reported and claimed collapsed into "is".
- **A conflict silently resolved.** If the brief records two sources disagreeing and the article states one figure, that is a defect even though every number in it is real.
- **Empty attribution** — "experts say", "researchers warn" — and unattributed numbers.
- **A closing summary paragraph** where forward-looking substance belongs.

### 3. Check sourcing

The scorer covers CVE identifiers and indicators. These still need a person:

- Fewer than 3 sources, or all from one tier.
- A version number or quote in the body that no listed source supports.
- Volatile claims with no date stamp.
- A quote that came from the brief's paraphrase rather than the source text.

### 4. Report

```
SEO Audit — akira-ransomware-sonicwall-sslvpn
Score: 13/15  ·  status: draft

  ✅   1. Title tag              58 chars, keyword at word 1
  ✅   2. H1                     single
  ❌   3. Meta description       171 chars (11 over)
  ✅   4. Slug                   4 words, keyword-bearing
  ✅   5. Keyword placement      first 100 words ✓, H2 ✓
  ⚠️   6. Keyword density        9 uses (target 4–8)
  ...

Editorial violations
  L34   "leverage" — banned vocabulary
  L58   opens "Furthermore" (L52 opens "Moreover")
  L91   "experts say" — empty attribution

Sourcing
  ⚠️   L67 "roughly 12,000 exposed instances" — no attribution in text

Proposed fixes
  1. L3   description → "<rewritten, 156 chars>"
  2. L34  "leverage" → "exploit"
  ...
```

Rows marked ⚠️ are advisory — a technical exploit-chain paragraph legitimately runs long. Rows marked ❌ against a **required** item in the rubric block publication regardless of total score.

### 5. Apply, then re-run until clean

Ask before editing. On confirmation apply the fixes, then **run the scorer again** — a fix can move another row, and adding words to satisfy the length row is the classic way to introduce a banned term or a transition chain.

Loop: fix → audit → fix → audit, until it exits clean or the only remaining rows are the two allowed exceptions (no hero image; a legitimately long technical paragraph). In practice one pass takes a draft from around 11/15 to 14/15, and the rows it fixes are ones a writing pass reliably misses.

Then set `status: review` and bump `updatedAt`.

Never rewrite whole sections unprompted. Fixes are surgical — a word, a sentence, a heading. If a section genuinely needs rewriting, say so and let the user decide.

## Rules

- Run the scorer; don't estimate. A hand count that disagrees with it is wrong.
- Never fix a keyword-density failure by stuffing. If the count is low, find a place the keyword genuinely belongs, or leave it and note it.
- Never invent an internal link to an article that doesn't exist.
- Preserve meaning. An SEO fix that changes a technical claim is a bug.
