# SEO Checklist

The scored rubric. `/seo-audit` evaluates every row and reports pass/fail. The build script stores the resulting score in the content index.

Scoring: each row is worth 1 point except where noted. A passing article scores 12 or higher out of 15, with no failures in the rows marked **required**.

---

## The rubric

| # | Item | Rule | Required |
|---|---|---|---|
| 1 | Title tag | ≤60 characters. Primary keyword within the first five words. Descriptive, not clickbait. No "You Won't Believe". | ✅ |
| 2 | H1 | **Zero H1 headings in the markdown body.** The page H1 is rendered from the `headline` frontmatter field, falling back to `title`. A `# ` heading in the body would give the page two H1 elements. | ✅ |
| 3 | Meta description | 150–160 characters. Contains the primary keyword. Ends with a concrete reason to click, not a teaser. | ✅ |
| 4 | Slug | 3–6 words, lowercase, hyphenated. Keyword-bearing. No dates, no stopwords (a, the, of, for, in). | ✅ |
| 5 | Keyword placement | Primary keyword in the first 100 words and in at least one H2. | ✅ |
| 6 | Keyword density | Primary keyword appears 4–8 times total across the article. Natural usage only — a forced instance costs more than a missing one. | |
| 7 | Secondary keywords | 3–5 declared in frontmatter, each used at least once in the body. | |
| 8 | Heading hierarchy | Logical H2/H3 nesting with no skipped levels. Headings are descriptive and scannable, not cute. At least one H2 in question form. | |
| 9 | Length | 900–1400 words of body copy, excluding frontmatter. | |
| 10 | Internal links | 2–4 links to other articles in `content/articles/`, placed where genuinely relevant. Descriptive anchor text — never "click here" or "this article". | |
| 11 | External links | 3 or more to primary sources. Link the first mention of each advisory, CVE, and research report. | ✅ |
| 12 | Images | Hero image declared with descriptive alt text. Alt text describes the image for a screen reader first; keyword inclusion is secondary and must not be forced. | |
| 13 | Schema | Frontmatter carries everything the `NewsArticle` JSON-LD needs: headline, description, datePublished, dateModified, author, publisher, image. | ✅ |
| 14 | Featured snippet | One 40–60 word paragraph that directly answers a question, placed immediately under a question-form H2. Self-contained — it must make sense lifted out of context. | |
| 15 | Readability | Average sentence length under 22 words. Flesch reading ease 40–65. | |

---

## Notes on the rows that get misapplied

**Title tag vs. H1.** These serve different readers. The title tag is what appears in search results and must front-load the keyword to survive truncation. The H1 is read by someone who already clicked, and can be more natural.

Both come from frontmatter: `title` becomes the `<title>` tag, `headline` becomes the `<h1>`. Omit `headline` when the two should be identical. The markdown body starts at H2 — an H1 there fails the build.

**Keyword density.** This is a ceiling, not a target. Modern ranking does not reward repetition, and stuffing is actively penalized. If the article reads naturally with the keyword four times, ship it at four.

**Internal links.** Only link where a reader would genuinely want the other piece. Two relevant links beat four contrived ones. If there are no relevant articles in `content/articles/` yet — which will be true early on — this row passes with zero and a note.

**External links.** Link out generously to primary sources. Linking to the actual Cisco advisory signals to both readers and search engines that the piece is sourced. Do not fear "leaking" authority; unsourced security writing has no authority to leak.

**Featured snippet paragraph.** The most valuable single element for a news article. It targets position zero. Write it as a direct answer to the question in the H2 above it, in complete sentences, with no reference to surrounding context ("as mentioned above" disqualifies it).

**Readability.** A paragraph explaining an exploit chain will run long, and that's correct. The check catches an article that runs long *throughout*, which is a different thing and a real defect: measured across matched topics, hand-written articles on this beat land at 14–18 words per sentence, so a failing row means the prose drifted rather than that the subject was hard. Treat it as fixable. The fix is variance — split the sentences over about 30 words, leave the short ones alone — and never cutting a fact, a hedge or a date stamp to buy the number.

The Flesch floor is 40 rather than the conventional 50. Syllable-counting heuristics treat `CVE-2026-12569`, `11.0 M030`, and `deserialization` as heavily polysyllabic, which drags clean technical security prose into the 40s. Measured against published copy from BleepingComputer and SecurityWeek, the 40–65 band is the honest target for this beat. Do not simplify accurate technical language to chase the number.

---

## Audit output format

`/seo-audit` reports:

```
SEO Audit — akira-ransomware-sonicwall-sslvpn
Score: 13/15

  ✅  1. Title tag                58 chars, keyword at position 1
  ✅  2. H1                       single
  ❌  3. Meta description         171 chars (over by 11)
  ✅  4. Slug                     4 words, keyword-bearing
  ...

Editorial violations:
  L34  "leverage" — banned vocabulary
  L58  paragraph opens with "Furthermore" (previous paragraph opens with "Moreover")

Proposed fixes: ...
```

Violations cite line numbers. Fixes are proposed, then applied only on confirmation.
