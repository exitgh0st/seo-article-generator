# Research Brief: N-able N-central authentication bypass (CVE-2026-18556 / CVE-2026-18577)

**Researched:** 2026-08-14
**Status:** ready

## Summary
N-able's N-central remote monitoring and management (RMM) platform is under active exploitation via two chained authentication-bypass vulnerabilities. Threat actors were first observed exploiting CVE-2026-18556, which N-able believed it had patched in version 2026.2; a patch bypass re-exposed the flaw as CVE-2026-18577. Both are in CISA's KEV catalog. Because N-central is an RMM tool holding admin privileges across MSP customer fleets, compromise of an N-central server cascades to downstream managed endpoints. Microsoft has attributed a related ransomware campaign to Storm-1175, a former Medusa affiliate deploying a new locker called StormEncryptor.

## Confirmed facts
- CVE-2026-18577 is an authentication bypass permitting a remote unauthenticated attacker to obtain administrative control of vulnerable N-central servers [S1][S5]
- CVE-2026-18577 is a patch bypass of CVE-2026-18556; both are described by N-able as "authentication bypass using an alternate path or channel" (CWE-288) [S1][S5][S7]
- Exploitation of CVE-2026-18577 observed in the wild since August 1, 2026 [S1]
- Affected: all versions up to and including 2026.3.1, prior to Hotfix [S1]. Arctic Wolf says both CVEs affect versions prior to 2026.3.1.7 [S7]
- Fixed in N-central 2026.3.1 Hotfix 1 (2026.3.1.7), released August 2, 2026; superseded by Hotfix 2 (2026.3.1.10), released August 6, 2026 [S1]
- Hotfix 2 "supersedes Hotfix 1 with additional hardening measures" and is required even if Hotfix 1 was applied [S8]
- CVE-2026-18577 added to CISA KEV on 2026-08-03, due 2026-08-06; CVE-2026-18556 added to KEV on 2026-08-04, due 2026-08-07 (per NVD records) [S3][S4]
- CISA's KEV additions subject FCEB agencies to BOD 26-04/section 22-01 remediation deadlines [S2][S3][S4]
- Post-exploitation behavior: attackers used N-central's legitimate "Take Control" feature to reach managed endpoints and registered a Cloudflare Tunnel ("Cloudflared") service for persistence [S1][S5][S8]
- Endpoint IOC: suspicious svchost.exe in the user's Documents folder [S1][S6]
- Six IP addresses published by N-able as network IOCs: 173.249.252.200, 87.249.138.34, 37.19.210.32, 37.153.90.88, 92.118.112.181, 68.235.46.214 [S1]
- Hosted/cloud N-central is upgraded automatically by the vendor; on-premise deployments require manual remediation [S1]
- N-able states only a "limited number of customers" were compromised [S5]

## Reported
- Microsoft Threat Intelligence tracks the ransomware actor as **Storm-1175**, assessed as China-based, a former Medusa ransomware affiliate; its first observed activity since April 2026, shifting from Medusa to a new locker called **StormEncryptor** (C++ malware, appends ".encrypted", drops ransom note '!!!README_FIRST!!!.txt', offers three days before data leak) [S6]
- Microsoft reported the attacks were "likely preceded by" exploitation of CVE-2026-18577 — Microsoft has not confirmed the exact initial-access vector [S6][S8]
- Sophos reported the actor created a domain account named "veeam", reset existing domain admin account passwords, enumerated accounts, installed additional remote-access tools, and disabled Microsoft and Sophos security software using an EDR-evasion tool; Sophos also expanded the IOC list with four more IPs and C2/TacticalRMM domains [S8]
- Huntress observed exploitation in one customer's N-central environment and says the actor targeted key servers (typically Domain Controllers), enumerated processes, and moved quickly across hosts [S8]
- Huntress warned many orgs had not patched as of August 3 [S5]

## Claimed
- No direct claim by the attacker (no leak-site post surfaced in this research). Attribution to Storm-1175 is an assessment from Microsoft Threat Intelligence, not confirmed by N-able or independently by the researcher organizations [S6][S8]

## Timeline
| Date | Event | Source |
|---|---|---|
| 2026-07-31 | N-able sees surge in N-central licensing/activity anomalies; begins investigation (N-able's Adlumin MDR flagged unusual customer activity) | [S5][S8] |
| 2026-08-01 | First observed exploitation of CVE-2026-18577 | [S1] |
| 2026-08-02 | N-able publishes advisory; releases 2026.3.1 Hotfix 1 (2026.3.1.7); CVE-2026-18577 disclosed | [S1][S5] |
| 2026-08-03 | CVE-2026-18577 added to CISA KEV (due 08-06) | [S3] |
| 2026-08-04 | CVE-2026-18556 added to CISA KEV (due 08-07) | [S4] |
| 2026-08-06 | N-able releases 2026.3.1 Hotfix 2 (2026.3.1.10) | [S1] |
| 2026-08-10 | Microsoft/Sophos/Huntress detail observed post-exploitation behavior; BleepingComputer reports StormEncryptor | [S6][S8] |

## Affected products and versions
- N-able N-central, all versions up to and including 2026.3.1, prior to Hotfix [S1]. Arctic Wolf frames both CVEs as affecting versions prior to 2026.3.1.7 [S7].
- Both on-premises and cloud-hosted deployments affected [S5].
- NVD description for CVE-2026-18556: "affects N-central: through 2026.1" (NVD description narrower than advisory; treat with care) [S4]

## Exploitation status
**Exploited in the wild.** Confirmed by N-able (in-the-wild since 2026-08-01) [S1]. Both CVEs in **CISA KEV** — CVE-2026-18577 added 08-03-2026 (due 08-06), CVE-2026-18556 added 08-04-2026 (due 08-07) [S3][S4]. FCEB agencies bound by BOD 26-04 [S2]. No public PoC confirmed in sources. Exploitation linked to active ransomware activity by Microsoft threat intelligence (Storm-1175 / StormEncryptor) [S6][S8].

## Attribution
- Microsoft Threat Intelligence assesses the ransomware actor to be **Storm-1175**, a China-based, financially motivated group formerly affiliated with Medusa ransomware. Microsoft stated the N-central attacks were "likely preceded by" exploitation of CVE-2026-18577 — an assessment, not a confirmed attribution. BleepingComputer relays this as Microsoft's view. [S6]
- Arctic Wolf's bulletin (Aug 3) states "No public attribution to specific threat actors has yet been made" for the N-central exploitation itself [S7].
- This is an attribution distinction worth preserving: N-central exploitation attribution vs. the Storm-1175/StormEncryptor ransomware linkage.

## Quotes
> "Following exploitation, the attacker leveraged the Take Control feature and connected to systems within the N-central managed environment. Once on those devices, the attackers registered a new service for a CloudFlare tunnel, enabling persistence into an environment after access to the N-central server was revoked." — N-able incident notice, via SecurityWeek [S5]

> "From an MSP perspective, exploitation of this flaw can grant an attacker full administrative access to an N-central console — the same level of control normally reserved for trusted NOC and engineering staff." — Huntress, via SecurityWeek [S5]

> "This threat actor is known to rapidly move from initial access to data exfiltration and ransomware deployment, often within a few days. Organizations are urged to monitor for Storm-1175 activity and apply security patches as soon as possible." — Microsoft Threat Intelligence, quoted by BleepingComputer [S6]

> "Applying Hotfix 2 closes the vulnerability that allowed attackers in, but it does not remove a threat actor who may already be present in your environment... If you applied either hotfix more than a few days after it was released, you should treat your environment as potentially compromised." — N-able, via Help Net Security (Aug 12 update) [S8]

## Mitigation
- Patch all N-central servers to 2026.3.1 Hotfix 2 (2026.3.1.10) urgently, "outside of normal patching schedules" [S1][S8]
- Hotfix 2 supersedes Hotfix 1 — apply it even if Hotfix 1 was already applied [S8]
- Hosted N-central updated automatically; on-prem requires manual remediation [S1]
- Recommended: upgrade N-central agents after applying the server hotfix [S1]
- If patching not possible: restrict N-central to trusted admin IPs/VPN, hide UI behind Cloudflare Access/reverse proxy, enforce MFA/SSO, consider taking server offline [S7]
- IOC checks: cloudflared service, suspect svchost.exe in Documents, six published IPs; also review auth logs, admin account creation/modification, Take Control session activity, Windows service installation events [S1]
- Critical caveat from N-able: patching does NOT evict an already-present threat actor; treat environments patched late as potentially compromised and audit all accounts/privileges/activity; use N-able's CVE-2026-18577 detection template [S1][S8]
- Reference prior related N-central CVEs CVE-2025-8875/CVE-2025-8876 exploited ~a year prior (context) [S5]

## Conflicts between sources
- **KEV addition dates for CVE-2026-18556:** NVD record states added 2026-08-04 (due 08-07) [S4]; Rapid7 states CVE-2026-18556 was added to KEV on August 5, 2026 [S1]; CISA's Aug 4 alert lists 18556 among three additions [S2]. Exact date differs by one day between NVD and Rapid7. Prefer NVD (authoritative) and note Rapid7's statement.
- **Affected-version phrasing:** Rapid7/SecurityWeek frame both CVEs as affecting versions "up to 2026.3.1 prior to Hotfix"; NVD's CVE-2026-18556 description says "through 2026.1" — narrower, likely reflecting the earlier disclosure scope before the bypass was found. Do not reconcile; report both.

## Open questions
- Which organizations/victims were affected — N-able has not quantified beyond "limited number of customers" [S5][S6]. Downstream MSP-customer tally unknown.
- Whether the attacker found a way around Hotfix 1 (N-able said it is "proactively expanding protections" but did not confirm a Hotfix 1 bypass) [S8]
- Whether the Storm-1175/StormEncryptor ransomware campaign is definitively tied to the CVE-2026-18577 N-central compromise — Microsoft says "likely preceded by," not confirmed [S6][S8]
- Full scale of exploitation across the MSP partner base; Huntress said not yet a "broad, indiscriminate campaign" as of its last update [S8]

## Suggested angles
1. **The RMM-supply-chain angle / "patch bypass made it worse"** — primary keyword: `N-able N-central CVE-2026-18577 exploited` — intent: sysadmin/IR wanting to know versions, patch status, whether exploited in the wild, and what to do before Monday — why it works: this is the immediate, high-stakes "is this in KEV, what's the fixed version" query for MSP operators. Strongest sourcing (Rapid7, CISA KEV, NVD).
2. **The ransomware-attribution angle (Storm-1175/StormEncryptor)** — primary keyword: `Storm-1175 N-able StormEncryptor ransomware` — intent: reader curious about who's behind it and whether the N-central flaw drives ransomware — why it works: high narrative interest, but attribution is a Microsoft assessment; weaker primary sourcing for the exact initial-access tie.
3. **The "patch your victims / compromised-env" operations angle** — primary keyword: `N-able N-central hotfix 2 IOCs take control cloudflared` — intent: IR leads needing IOCs and the "patching doesn't evict attackers" message — why it works: actionable and important (detection template, IP list), complements angle 1.

## Sources
- [S1] "N-able N-central Authentication Bypass Exploited in the Wild (CVE-2026-18577)" — Rapid7 — Tier 1 — https://www.rapid7.com/blog/post/etr-cve-2026-18577-n-able-n-central-authentication-bypass-exploited-in-the-wild — accessed 2026-08-14
- [S2] "CISA Adds Three Known Exploited Vulnerabilities to Catalog" — CISA — Tier 1 — https://www.cisa.gov/news-events/alerts/2026/08/04/cisa-adds-three-known-exploited-vulnerabilities-catalog — accessed 2026-08-14
- [S3] "CVE-2026-18577 Detail" — NVD — Tier 1 — https://nvd.nist.gov/vuln/detail/CVE-2026-18577 — accessed 2026-08-14
- [S4] "CVE-2026-18556 Detail" — NVD — Tier 1 — https://nvd.nist.gov/vuln/detail/CVE-2026-18556 — accessed 2026-08-14
- [S5] "N-able Patches Vulnerability Exploited to Hack N-central Servers" — SecurityWeek — Tier 2 — https://www.securityweek.com/n-able-patches-vulnerability-exploited-to-hack-n-central-servers — accessed 2026-08-14
- [S6] "New StormEncryptor ransomware used by former Medusa affiliate" — BleepingComputer — Tier 2 — https://www.bleepingcomputer.com/news/security/new-stormencryptor-ransomware-used-by-former-medusa-affiliate — accessed 2026-08-14
- [S7] "CVE-2026-18556 / CVE-2026-18577: N-able N-central Authentication Bypass Vulnerabilities Require Immediate Patching" — Arctic Wolf — Tier 1 — https://arcticwolf.com/resources/blog/cve-2026-18556-cve-2026-18577 — accessed 2026-08-14
- [S8] "N-able ships second N-central hotfix as attackers keep exploiting CVE-2026-18577" — Help Net Security — Tier 3 — https://www.helpnetsecurity.com/2026/08/10/cve-2026-18577-n-central-hotfix-2-msps — accessed 2026-08-14

**Fetch failures to note:** N-able's primary advisory pages at status.n-able.com (both the Hotfix 1 and Hotfix 2 notices) could not be fetched — the domain resolves to a non-public address (192.0.78.x). N-able's own statements in this brief are therefore quoted indirectly through Rapid7, SecurityWeek, BleepingComputer, and Help Net Security rather than read directly from N-able. Recommend a follow-up fetch of n-able.com/blog posts or the advisory mirror if first-party confirmation is required.
