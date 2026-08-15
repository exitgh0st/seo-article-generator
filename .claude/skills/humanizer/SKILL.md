---
name: humanizer
description: Remove the patterns that make writing read as machine-generated. Use as a step inside the article pipeline, or on its own against a draft. Triggers on "humanize", "sounds like AI", "make this sound human", "remove AI tells".
---

# Humanizer

Take text drafted by a model and strip the patterns that mark it as one.

> Adapted from [blader/humanizer](https://github.com/blader/humanizer) v2.9.1
> (MIT, © 2025 Siqi Chen — see `LICENSE`). The pattern taxonomy and the
> three-pass loop are theirs. This copy is edited for a cybersecurity news beat;
> the deltas live in `docs/humanize-calibration.md` and **override anything here
> they contradict**.

## Read the calibration first

`docs/humanize-calibration.md` is not optional context. On this beat one of the
generic rules below is actively wrong — stripping hedges destroys attribution that
the editorial standards require — and two others need bounding. Read it before
you change a word.

## The passes

Three, in order. Do not collapse them.

**1. Draft.** Identify the patterns below and rewrite for natural rhythm.
Preserve every claim, every citation, every number.

**2. Audit.** Answer two questions honestly, in writing:
- *What still makes this obviously AI?*
- *Did I introduce, drop or alter any claim?*

**3. Final.** Revise to address what the audit found.

The audit pass is the one that earns its cost. A single rewrite pass reliably
trades one set of tells for another — it removes the banned vocabulary and leaves
the uniform paragraph rhythm untouched.

## What to look for

**Content**
1. Undue emphasis on significance or legacy — "pivotal moment", "marks a shift"
2. Notability claims with no context
3. Superficial `-ing` analyses — "highlighting", "underscoring", "symbolizing"
4. Promotional language — "vibrant", "nestled", "breathtaking"
5. Vague attribution — "experts argue", "researchers warn", unsourced claims
6. Formulaic "Challenges" / "Implications" sections

**Language**
7. Overused AI vocabulary — "landscape", "tapestry", "delve", "crucial", "realm"
8. Copula avoidance — "serves as" where "is" is meant
9. Negative parallelism — "not just X, but Y"
10. Rule-of-three forcing — three adjectives where one fact belongs
11. Elegant variation — synonym-cycling a term that should stay fixed
12. False ranges — "from X to Y" as a rhetorical gesture
13. Passive voice hiding the actor

**Style**
14. Em and en dashes
15. Mechanical boldface
16. Bolded list-item headers
17. Title Case In Headings
18. Emoji decoration
19. Curly quotation marks

**Communication**
20. Chatbot artifacts — "I hope this helps", "let me know"
21. Knowledge-cutoff disclaimers and speculative gap-filling
22. Sycophantic tone

**Filler**
23. Filler phrases and signposting — "It's worth noting", "As we'll see"
24. Excessive hedging *(see the calibration — the rule inverts here)*
25. Generic concluding paragraphs that restate the piece
26. Hyphenated-pair padding — "fast-moving", "ever-changing"
27. Persuasive tropes and manufactured drama
28. Fragmented headers
29. Aphorism formulas — "In security, X is everything"
30. Rhetorical openers
31. Diff-anchored writing — describing what changed rather than what is
32. Uniform sentence length

## Rules

- **Preserve information, not shape.** Every claim survives. Depth does not have
  to be uniform; a paragraph may become two sentences or six.
- **Never invent.** No new names, numbers, dates, quotes or citations. Nothing
  that was not already there.
- **Voice follows the material.** Add personality to an essay. Technical and
  reference writing keeps its neutral register — this beat is the latter.
- **If a writing sample is supplied, match its habits** over the generic rules
  above, including its dash frequency.

## Modes

- **Pasted text** — return the draft, the audit findings as bullets, then the
  final text.
- **File** — rewrite in place and describe what changed.
- **Embedded** — you are one step of a larger job. Output the final text only.
  No preamble, no audit bullets, no summary. The caller is parsing this.
