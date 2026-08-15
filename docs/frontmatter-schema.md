# Frontmatter Schema

Every file in `content/articles/` opens with a YAML frontmatter block. The build script (`scripts/build-content-index.mjs`) validates it and fails loudly on a malformed or incomplete block rather than emitting a broken index.

---

## Full example

```yaml
---
title: "Akira Ransomware Exploits SonicWall SSLVPN Flaw in Active Campaign"
slug: akira-ransomware-sonicwall-sslvpn
description: "Akira operators are exploiting a SonicWall SSLVPN flaw to breach networks within hours. Affected versions, IOCs, and what to patch now."
primaryKeyword: "akira ransomware sonicwall"
secondaryKeywords:
  - "sslvpn vulnerability"
  - "ransomware mitigation"
  - "sonicwall patch"
category: ransomware
tags: [akira, sonicwall, vpn, ransomware, edge-devices]
author:
  name: "Jordan Ellis"
  title: "Security Writer"
publishedAt: 2026-08-10
updatedAt: 2026-08-10
status: draft
heroImage:
  src: /assets/images/akira-sonicwall.jpg
  alt: "SonicWall firewall appliance mounted in a server rack"
cves:
  - CVE-2026-40213
sources:
  - title: "Akira Ransomware Targeting SonicWall SSLVPN"
    url: "https://arcticwolf.com/resources/blog/akira-sonicwall/"
    publisher: "Arctic Wolf"
    tier: 1
    accessedAt: 2026-08-10
  - title: "SNWLID-2026-0012: SSLVPN Improper Access Control"
    url: "https://psirt.global.sonicwall.com/vuln-detail/SNWLID-2026-0012"
    publisher: "SonicWall PSIRT"
    tier: 1
    accessedAt: 2026-08-10
canonical: ""
---
```

---

## Field reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | ✅ | The `<title>` tag and SERP headline. ≤60 characters, primary keyword in the first five words. Quote it — colons break unquoted YAML. |
| `headline` | string | | The on-page `<h1>`, rendered from frontmatter. Falls back to `title` when absent. Use it when the headline a reader sees should be longer or more natural than the one that has to survive SERP truncation. **The body must not contain an H1** — the build fails if it does. |
| `slug` | string | ✅ | URL path segment. Must match the filename without `.md`. 3–6 words, lowercase, hyphenated, no dates. |
| `description` | string | ✅ | Meta description. 150–160 characters. Contains the primary keyword. |
| `primaryKeyword` | string | ✅ | The single target query. Lowercase. |
| `secondaryKeywords` | string[] | ✅ | 3–5 supporting queries, each used at least once in the body. |
| `category` | enum | ✅ | One of: `vulnerabilities`, `breaches`, `ransomware`, `threat-intel`, `policy`, `ai-security`. Drives `/category/:category`. |
| `tags` | string[] | ✅ | 3–8 lowercase hyphenated tags. Vendors, threat groups, technologies. Drives `/tag/:tag`. |
| `author.name` | string | ✅ | Byline. Feeds `NewsArticle` author. |
| `author.title` | string | | Shown under the byline. |
| `publishedAt` | date | ✅ | `YYYY-MM-DD`. Set at creation; do not change on edits. |
| `updatedAt` | date | ✅ | `YYYY-MM-DD`. Bump on every substantive edit — Google uses `dateModified` for news freshness. |
| `status` | enum | ✅ | `draft` \| `review` \| `published`. Only `published` articles appear on the public site. |
| `heroImage.src` | string | | Path under `app/public/`. Omit if there's no image; do not invent a path. |
| `heroImage.alt` | string | | Required whenever `src` is set. Describes the image for a screen reader. |
| `cves` | string[] | | Uppercase `CVE-YYYY-NNNNN`. Every ID must appear in a fetched source. |
| `sources` | object[] | ✅ | Minimum 3. See below. |
| `canonical` | string | | Set only when the piece is syndicated from elsewhere. Empty string otherwise. |

Do not put `seoScore` in frontmatter. It is computed into the generated index and any value in the markdown is ignored.

### `sources[]`

| Field | Required | Notes |
|---|---|---|
| `title` | ✅ | The source page's actual headline. |
| `url` | ✅ | Direct link to the specific page, not a homepage. |
| `publisher` | ✅ | Organization name. |
| `tier` | ✅ | `1`, `2`, or `3` — see `docs/sources.md`. |
| `accessedAt` | ✅ | `YYYY-MM-DD` you fetched it. Security pages get edited after publication. |

---

## Generated fields

The build script computes these into the generated index. It never writes back to the markdown — the markdown is yours, the index is derived:

- `wordCount` — body words, frontmatter excluded
- `readingTime` — minutes, at 225 wpm
- `html` — rendered body
- `headings` — extracted H2/H3 for a table of contents
- `seoScore` — the `docs/seo-checklist.md` result
- `seoBreakdown` — per-row pass/fail, consumed by the admin SEO panel

---

## Validation rules

The build fails on any of these:

- A required field missing or empty
- `slug` not matching the filename
- `category` outside the enum
- `status` outside the enum
- Fewer than 3 entries in `sources`
- A `source` missing `url` or `tier`
- A malformed CVE ID
- `heroImage.src` set without `alt`
- `publishedAt` or `updatedAt` not `YYYY-MM-DD`

Warnings that do not fail the build: title over 60 characters, description outside 150–160, word count outside 900–1400. These land in the SEO score instead.
