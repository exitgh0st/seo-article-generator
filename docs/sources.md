# Sources

Source quality is the difference between an article that holds up and one that gets corrected in public. Tier every source before citing it.

---

## Tier 1 — Primary

The organization with direct knowledge. Cite freely; these carry the article.

**Vendor advisories (PSIRT)** — the authoritative record for affected versions and patch availability.

- Microsoft MSRC — `msrc.microsoft.com/update-guide`
- Cisco PSIRT — `sec.cloudapps.cisco.com/security/center/publicationListing.x`
- Fortinet PSIRT — `fortiguard.com/psirt`
- SonicWall PSIRT — `psirt.global.sonicwall.com`
- Ivanti, Citrix, VMware/Broadcom, Palo Alto, Atlassian, Oracle CPU, Adobe, Apple, Google Chrome releases

**Government and coordinating bodies**

- CISA Advisories and the Known Exploited Vulnerabilities catalog — `cisa.gov/known-exploited-vulnerabilities-catalog`
- Joint advisory mirrors — `ic3.gov`, `media.defense.gov`, `fbi.gov`, `nsa.gov`. A #StopRansomware advisory is co-published by several agencies and the CISA copy is not always the one that resolves; the mirrors carry the identical document.
- NVD — `nvd.nist.gov` (CVSS scores, CPE data)
- MITRE CVE — `cve.org`
- CERT/CC Vulnerability Notes — `kb.cert.org/vuls`
- NCSC UK, ACSC Australia, ENISA
- SEC 8-K filings for material breach disclosures at US public companies
- State attorney-general breach notification portals (California, Maine, Texas)

**First-party incident disclosures** — the breached organization's own statement, status page, or filing.

**Vendor threat research** — genuinely primary telemetry, but never neutral. Always attribute in-text.

- Mandiant/Google Threat Intelligence, Cisco Talos, Microsoft Threat Intelligence, Unit 42, CrowdStrike, Recorded Future, Arctic Wolf, Huntress, Rapid7, watchTowr, Volexity, ESET, Kaspersky, Sophos, Trend Micro Zero Day Initiative, Check Point Research, Wiz, Bishop Fox, Fortra
- Shadowserver and Censys/Shodan for exposure counts

**GitHub Security Advisories** — `github.com/<owner>/<repo>/security/advisories/GHSA-…` is the maintainer's own disclosure, and for open-source projects it is usually the only advisory there is. Treat it exactly as a vendor PSIRT page.

---

## Tier 2 — Credible reporting

Independent security journalism with a track record of corrections and named sourcing. Cite alongside Tier 1.

- BleepingComputer
- The Hacker News
- KrebsOnSecurity
- Dark Reading
- The Record (Recorded Future News)
- SecurityWeek
- Ars Technica security desk
- The Register security desk
- CyberScoop
- Risky Business newsletter
- SANS Internet Storm Center diaries

These outlets often break stories before vendors confirm. When a Tier 2 outlet is ahead of the advisory, that's reportable — use "reported" and say the vendor has not yet confirmed.

---

## Tier 3 — Leads only

Never the sole support for a claim. Use to find a story, then verify at Tier 1 or 2.

- Aggregators and content farms
- Reddit (r/netsec, r/sysadmin), Hacker News comments
- Social posts from unverified accounts
- SEO-bait security blogs that rewrite other outlets' reporting
- LLM-generated news sites

**Ransomware leak sites** are a special case. A gang's claim that it breached a company is evidence the gang *claims* it, nothing more. Report it as a claim, attribute it to the leak site, and note whether the named victim has responded. Gangs inflate, recycle old data, and name victims they never touched.

---

## Sourcing rules

**Three independent sources minimum.** Three outlets rewriting the same Bleeping Computer piece is one source, not three.

**Prefer the primary.** If BleepingComputer describes a Cisco advisory, cite the advisory. Use the outlet for context the advisory omits.

**Check the date on everything.** Security pages get silently updated. Record `accessedAt`. If a page carries an "Updated:" stamp, note which revision you read.

**Cross-check numbers.** Victim counts, exposed-instance counts, and ransom amounts vary wildly between outlets. When they disagree, give the range and attribute both.

**Vendor incentive.** A company selling SSLVPN protection publishing research on an SSLVPN flaw is doing real work with a real interest in your alarm. Attribute in-text and let readers weigh it.

**Attribution claims are the weakest link in security reporting.** "Linked to" and "with moderate confidence" mean something specific — preserve the hedge. Never upgrade a researcher's "possibly linked to a Chinese-speaking group" into "Chinese state hackers".

---

## Quick verification workflow

1. Does a Tier 1 advisory exist? Fetch it. It settles versions and patch status.
2. Is the CVE in CISA KEV? That converts "could be exploited" to "is being exploited" and adds a federal deadline.
3. Do at least two Tier 2 outlets agree on the narrative?
4. Do any facts conflict across sources? If yes, that conflict goes in the article.
5. Is anything load-bearing supported only by Tier 3? Cut it or label it as an unverified claim.
