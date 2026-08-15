---
name: research
description: Research cybersecurity news and produce a sourced research brief. Use when the user asks to research a security topic, find recent news, investigate a CVE or breach, or when /write-article is invoked without an existing brief. Triggers on "research", "find news about", "what's happening with", "look into".
---

# Research

Produce a verified research brief that a later writing step can work from without re-searching. The brief is the frozen fact set — anything not in it does not go in the article.

## Input

`/research <topic>` — a vendor, threat group, CVE, product, or theme.

With no topic, default to the most significant cybersecurity news of the past 7 days. Search broadly first, then pick the two or three most consequential stories and ask the user which to pursue.

## Steps

### 1. Search

Run several `WebSearch` queries at different angles rather than one broad query. For a topic like "sonicwall":

- `sonicwall vulnerability exploited` + the current month and year
- `sonicwall CVE advisory`
- `sonicwall ransomware campaign`
- `sonicwall PSIRT` for the primary advisory

Include recency terms. Search results are ranked, not dated — check publication dates on every hit and discard anything older than the story.

### 2. Tier the results

Sort hits by `docs/sources.md` tiering. Tier 1 (vendor advisory, CISA KEV, NVD, CERT, first-party disclosure) anchors the brief. Tier 2 (BleepingComputer, The Hacker News, Krebs, Dark Reading, The Record, SecurityWeek) supplies narrative and quotes. Tier 3 is a lead only — never cite it alone.

Three outlets rewriting the same original report count as one source.

### 3. Fetch

`WebFetch` the top 5–8 sources. Always fetch the primary advisory if one exists — do not rely on an outlet's summary for version numbers or patch status.

Extract only what's actually on the page. If a source doesn't state the CVSS score, the brief records "not stated in sources", not a guess.

### 4. Save the page text — do not skip this

For every page you successfully fetched, write the extracted text to:

```
content/research/<YYYY-MM-DD>-<slug>.sources/S<n>-<publisher>.md
```

with a small frontmatter block and the page text as the body:

```markdown
---
url: "https://labs.watchtowr.com/..."
publisher: "watchTowr Labs"
tier: 1
accessedAt: 2026-08-14
---

<the extracted page text, as fetched>
```

This directory is the fact substrate, and two things depend on it.

**It is what `npm run audit` checks against.** The grounding gate compares every CVE identifier and every indicator of compromise in a finished article against this text. With no sidecar the check does not fail — it passes vacuously, reporting that nothing could be verified. An article that publishes six IP addresses nobody can trace will sail through.

**It is what the writing step searches.** A brief is a summary, and summarising loses the exact function name, the endpoint path, the plugin's restart behaviour, the filename a proof-of-concept drops. Those specifics are what separate a competent article from a generic one, and they are still in the page text after the brief has moved on. Keeping the pages means the writing step can go back for them.

Name files so the `S<n>` matches the `[S1]`, `[S2]` references in the brief.

### 5. Record what you could not fetch

Add a line at the end of the brief naming every source you tried and failed to retrieve, with the reason:

```
**Fetch failures:** status.n-able.com (resolves to a non-public address);
nvd.nist.gov/vuln/detail/CVE-2026-11111 (502)
```

This is not bookkeeping. A brief whose vendor advisory could not be read is a brief where every vendor statement is second-hand, and the article has to say so rather than implying first-party confirmation.

### 6. Write the brief

To `content/research/<YYYY-MM-DD>-<slug>.md`:

```markdown
# Research Brief: <topic>

**Researched:** YYYY-MM-DD
**Status:** ready | needs-follow-up

## Summary
Two or three sentences. What happened, who's affected, why it matters.

## Confirmed facts
Sourced to Tier 1. Each line ends with a source reference.
- CVE-2026-XXXXX, CVSS 9.8, improper access control in SSLVPN [S1]
- Affects firmware 7.1.x through 7.1.3-4021 [S1]
- Patched in 7.1.3-4030, released 2026-08-04 [S1]

## Reported
Tier 2 reporting not yet confirmed by the vendor.
- Arctic Wolf observed exploitation from mid-July [S3]

## Claimed
Threat actor assertions, leak-site posts, unverified statements.
- Akira leak site lists 14 victims; none have confirmed [S5]

## Timeline
| Date | Event | Source |
|---|---|---|

## Affected products and versions

## Exploitation status
In the wild? In CISA KEV? PoC public? Federal deadline?

## Attribution
Preserve the original hedging exactly as researchers stated it.

## Quotes
> "..." — Name, Title, Organization, via [S3]

## Mitigation
Patch versions, workarounds, IOCs, detection guidance.

## Conflicts between sources
Where sources disagree, and how. This goes in the article.

## Open questions
What is not known. Explicitly.

## Suggested angles
1. **<angle>** — primary keyword: `...` — intent: ... — why it works: ...
2. ...

## Sources
- [S1] "Exact page title" — Publisher — Tier 1 — https://url — accessed YYYY-MM-DD
```

The source lines are parsed on import, so the shape is load-bearing: leading
`- `, the `[Sn]` marker, the title in double quotes, and em-dash separators.
A line that does not match is silently dropped, and a brief that drops below
three parsed sources fails the import.

### 7. Report

Summarize in chat: the story in two sentences, source count by tier, how many pages were saved to the sidecar, anything you could not fetch, the open questions, and the suggested angles. Ask which angle to pursue.

## Rules

- Never fill a gap from memory. "Not stated in sources" is a valid and correct brief entry.
- Preserve hedged attribution verbatim. "Possibly linked to a Chinese-speaking group" never becomes "Chinese state hackers".
- Record `accessedAt` for every source — security pages get silently revised.
- If everything you found is Tier 3, say so and stop. A brief with no primary sourcing is not a brief.
- Conflicts between sources are findings, not problems to resolve. Record both and attribute each.
- Every specific in the brief must come from a page you saved to the sidecar. A fact that reaches the brief but not the sidecar is unverifiable by anything downstream, and it will be published with the same confidence as one that was checked.
