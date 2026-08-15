# Humanize Calibration

Overrides to `.claude/skills/humanizer/SKILL.md` for this beat. Where the two
disagree, this file wins.

The generic skill is tuned for essays and marketing copy. Cybersecurity news has
one property that changes the arithmetic: **the reader acts on it.** They block an
address, patch a version, believe an attribution. A rewrite that improves rhythm
and breaks a fact has made the piece worse, not better, and it will read *more*
convincing while being wrong.

---

## 1. Hedges are facts. Never strip them.

The skill lists "excessive hedging" as filler to remove. On this beat that rule
inverts, and it is the single most damaging thing to get wrong.

`docs/editorial-standards.md` requires hedged attribution to survive verbatim.
The confidence verb *is* the claim:

| Keep exactly | Never rewrite to |
|---|---|
| Microsoft said the intrusions were **likely preceded by** exploitation | were preceded by |
| The actor behind these attacks **remains unconfirmed** | The actor is X |
| Arctic Wolf **assesses** the group to be China-based | The group is China-based |
| Rapid7 **reported** attempts were unsuccessful | Attempts were unsuccessful |
| The leak site **claims** 14 victims | 14 victims were breached |

"Confirmed", "reported" and "claimed" mark three different epistemic states.
Flattening any of them into "is" is a correctness bug, not a concision win.

**Also keep:** "as of <date>", "no source states", "unknown", "not disclosed", and
any sentence whose job is to mark the edge of what is known. Those read as
hedging and are load-bearing.

## 2. Technical strings are byte-exact.

Pass through untouched, character for character:

- CVE identifiers, CWE identifiers, CVSS scores and vectors
- Version and build numbers — `2026.3.1 Hotfix 2 (2026.3.1.10)`, `7.2.63.2`
- IP addresses, including defanged forms like `192.42.116[.]58`
- File hashes, filenames, service names, endpoint paths, registry keys
- Product names and the exact spelling of vendor and researcher names
- Dates, deadlines and counts

**Never re-word inside a blockquote.** A direct quote is evidence; editing it for
rhythm manufactures one.

If a sentence containing an identifier is clumsy, rewrite the sentence *around*
the identifier.

**Markdown links are not decoration.** Every `[text](url)` stays, pointing at the
same URL. Linking the first mention of an advisory or a CVE record is what makes
a claim sourced, and the SEO rubric fails an article with fewer than three. A
measured run of this pass removed every link in the article while improving the
prose, which is a net loss. Rewrite the words around a link if you must; never
unwrap it.

## 3. Em dashes: remove all.

Follow the skill as written. Convert to a comma, a colon, a full stop or a
restructured sentence, whichever the sentence actually wants.

This is a deliberate house-style change. Existing articles use em dashes heavily
and will read differently after the backfill.

Do not simply swap every em dash for a comma — that produces comma splices and a
flat, breathless rhythm, which is its own AI tell. Where the dash was carrying a
real break, use a full stop.

## 4. Structure that must survive

The article shape in `CLAUDE.md` is load-bearing for SEO and is not yours to
improve:

- **The lede stays first and stays specific.** Do not move context up.
- **Heading levels and the question-form H2 stay.** One 40–60 word paragraph sits
  under a question-form H2 as a featured-snippet target; keep it self-contained
  and keep it in that band.
- **Second person stays confined to the mitigation section**, and stays present
  there.
- **The closing section stays forward-looking.** Do not convert it into a summary
  while removing "generic concluding paragraphs" — the fix for a bad ending here
  is open questions and what to watch, not deletion.
- **Frontmatter is not prose.** Do not touch it.

## 5. What "uniform sentence length" means here

This is the tell worth chasing hardest. Measured across three generated articles,
average sentence length ran 22.3, 22.4 and 25.3 words with almost no variance —
the rubric's readability row failed all three.

Target real variance, not a lower average: a long technical sentence explaining an
exploit chain is correct and should stay long. Follow it with a short one. A
six-word paragraph is allowed and often lands hardest.

### The other half of the row is word length

The readability row fails on two independent conditions, and sentence length is
only one of them. An article can average a clean 20.1 words per sentence and still
fail on a Flesch score of 36.5, which is a measurement of syllables per word.

Where a plain word carries the same meaning, use it. "Scaled up" rather than
"industrialised", "firms" rather than "organisations", "plain" rather than
"unglamorous", "login-checking files" rather than "authentication processing
files". Four substitutions of that kind moved a measured article from 37.5 to
41.5 and turned the row green.

What never gets simplified: a technical term, a product name, a CVE identifier, a
version string, a hedge, or an attribution. The Flesch floor is 40 rather than the
usual 50 precisely because this beat is allowed its polysyllables — spend that
allowance on the words that carry meaning, not on ordinary prose.

---

## The check that runs afterwards

Grounding re-runs on the rewritten text. If a CVE identifier or an indicator of
compromise that traced to a source before no longer traces, the rewrite altered a
fact and the step **fails** naming that identifier.

That check is the reason this pass is safe to run at all. It is not a formality,
and a failure means the rewrite was wrong — not that the check is too strict.
