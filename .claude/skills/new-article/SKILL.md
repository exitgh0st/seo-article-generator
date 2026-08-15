---
name: new-article
description: Take a topic from nothing to a review-ready article in one pass — research, write, audit until it scores, and load it into the database. Use when the user names a security topic and wants the finished article without driving each step. Triggers on "new article", "write me an article about", "one shot", "do the whole thing", "end to end".
---

# New Article

The whole pipeline, unattended: research → write → audit until it passes → import.
One command, one report at the end.

## Input

`/new-article <topic>` — a vendor, CVE, threat group, product, or story.

`/new-article <topic> --angle 2` — force a specific suggested angle instead of the strongest one.

`/new-article --brief <slug>` — resume from a brief that already exists, skipping research.

`/new-article <topic> --publish` — go all the way live. Read "Where this stops" before using it.

## Where this stops

**Default: `status: review`, imported, not published.**

Publishing is public and effectively irreversible — a URL gets indexed, and an
article with a wrong CVE under a byline is worse than one published a day later.
The whole point of the pipeline is that a person reads the piece before it ships,
and an unattended run cannot be that person.

So the run ends with the article in the database at `review`, and a one-line
command to publish it. `--publish` overrides that, and should be used when the
operator intends to read the draft anyway and just wants fewer keystrokes.

## The run

Follow the existing skills for the *how* — read each one when you reach its step
rather than working from memory. This skill owns the sequence, the checkpoints
and the stopping rules, not the editorial rules.

### 1. Research

Follow `.claude/skills/research/SKILL.md` in full, including the `.sources/`
sidecar. **Do not skip the sidecar.** Everything downstream — the grounding gate,
the specifics the writing step mines — reads from it, and without it the accuracy
checks pass without checking anything.

### 2. Pick the angle without asking

The research skill normally asks which angle to pursue. In a one-shot run, choose:

- `--angle N` if the user gave one.
- Otherwise the **defender-focused angle** — the one answering "am I affected, and
  what do I do about it". It is almost always angle 1, it has the strongest
  sourcing, and it serves the audience in `CLAUDE.md`. An attribution or
  deep-technical angle is a better read and a worse article when nobody chose it.

State which angle you took and why in the final report.

### 3. Write

Follow `.claude/skills/write-article/SKILL.md`, including step 1b — grep the
sidecar for every specific before writing it. That step is most of the difference
between an article and a summary of a summary.

### 4. Audit until it passes

```bash
npm run audit -- <slug> --brief <brief-slug>
```

Fix what it reports, run it again. **Up to three passes.** In practice one pass
takes a draft from around 11/15 to 14/15 — the rows it catches are the mechanical
ones a writing pass reliably misses.

One row may stay unfixed and does not count as a failure: **Images**, when there
is no real image. Never invent a path. Nothing sets `heroImage`, so **14/15 is the
working ceiling** and an article that reaches it is done.

**Readability is not excused.** It used to be, on the reasoning that a paragraph
explaining an exploit chain runs long. Measured across five articles on matched
topics, this path lands at 14.4 to 17.7 words per sentence while the in-app
pipeline lands at 17.7 to 25.9 on the same material, so the row is winnable and
the excuse was covering a real gap. Fix it by splitting the sentences over about
30 words and leaving the short ones alone — the target is variance, not a lower
average. Never shorten by dropping a fact, a hedge, or a date stamp.

If it is still failing after three passes, stop and report. Do not keep grinding
— a rubric that will not go green after three targeted fixes usually means the
angle or the sourcing is wrong, and more passes make the prose worse while
chasing a number.

Then set `status: review` and bump `updatedAt`.

### 5. Import

```bash
npm run import -- --force
```

Read the output. `0 with page text` on the brief means the sidecar did not land
and nothing was verified — treat that as a failure of step 1, not a detail.

### 6. Publish, only with `--publish`

```bash
npm run publish -- <slug>
```

It re-runs every gate server-side and refuses rather than warns. A refusal is the
system working: read the blockers, fix the article, run it again. Never work
around it.

### 7. Report

Keep it short and lead with the outcome:

- The story in two sentences, and the angle taken.
- Final score, word count, source count and tier mix.
- **Anything deliberately left out because it could not be verified.** This
  matters more than the rest — it tells the user what a competitor might cover
  that this piece does not, and why.
- Anything that could not be fetched, and what that means for the sourcing.
- Where conflicts between sources were reported rather than resolved.
- The publish command, or the publish result.

## When to stop and ask

An unattended run should finish unattended. Stop only where continuing produces
something worse than nothing:

- **No Tier 1 source.** A brief with no primary sourcing is not a brief. Say what
  you found and stop.
- **The core facts contradict each other** — different CVE IDs for the same flaw,
  or sources disagreeing on whether something is exploited at all. Present both
  and let the user decide. A conflict *within* a fact set you understand is
  different: report it in the article and keep going.
- **Grounding blocks and you cannot fix it honestly.** If the audit refuses an
  indicator or a CVE that is genuinely central to the story, the answer is never
  to delete the claim quietly. Report it.
- **Three audit passes and still failing.**

Everything else — a missing hero image, one dead source you can replace, an angle
that turns out thinner than expected — is yours to resolve.

## Rules

- The stopping rules above are not suggestions. An unattended run that pushes
  through a missing primary source produces a confident, wrong article, which is
  the one output this pipeline exists to prevent.
- Never write from memory. If research produced nothing usable, that is the
  report.
- Never invent an IOC, a version, a CVSS score or a quote to satisfy a rubric row.
- Report what you left out. Silence about a gap reads as completeness.
