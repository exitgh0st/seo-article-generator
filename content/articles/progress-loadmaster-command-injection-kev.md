---
title: "Progress LoadMaster Flaw in CISA KEV, Patched Since June"
headline: "A Progress LoadMaster Bug Fixed in June Just Landed in CISA's KEV Catalog"
slug: progress-loadmaster-command-injection-kev
description: "Progress LoadMaster is in CISA's KEV catalog after 792 recorded exploit attempts. Affected versions, the June fix, IOC addresses, and the federal deadline."
primaryKeyword: "progress loadmaster"
secondaryKeywords:
  - "CVE-2026-8037"
  - "watchTowr"
  - "CISA KEV"
  - "escape_quotes"
category: vulnerabilities
tags: [progress, kemp, loadmaster, cisa-kev, command-injection, watchtowr]
author:
  name: "Jordan Ellis"
  title: "Security Writer"
publishedAt: 2026-08-14
updatedAt: 2026-08-14
status: draft
cves:
  - CVE-2026-8037
sources:
  - title: "CVE-2026-8037 Detail"
    url: "https://nvd.nist.gov/vuln/detail/CVE-2026-8037"
    publisher: "NVD"
    tier: 1
    accessedAt: 2026-08-14
  - title: "CISA Adds One Known Exploited Vulnerability to Catalog"
    url: "https://www.cisa.gov/news-events/alerts/2026/08/07/cisa-adds-one-known-exploited-vulnerability-catalog"
    publisher: "CISA"
    tier: 1
    accessedAt: 2026-08-14
  - title: "Enterprise Tech, In Shell Out: Progress Kemp LoadMaster Uninitialized Heap to Pre-Auth RCE (CVE-2026-8037)"
    url: "https://labs.watchtowr.com/enterprise-tech-in-shell-out-progress-kemp-loadmaster-uninitialized-heap-to-pre-auth-rce-cve-2026-8037/"
    publisher: "watchTowr Labs"
    tier: 1
    accessedAt: 2026-08-14
  - title: "Progress Kemp LoadMaster Vulnerability Targeted (CVE-2026-8037)"
    url: "https://www.esentire.com/security-advisories/progress-kemp-loadmaster-vulnerability-targeted-cve-2026-8037"
    publisher: "eSentire"
    tier: 1
    accessedAt: 2026-08-14
  - title: "CISA warns of critical Progress LoadMaster flaw exploited in attacks"
    url: "https://www.bleepingcomputer.com/news/security/cisa-warns-of-critical-progress-loadmaster-flaw-exploited-in-attacks"
    publisher: "BleepingComputer"
    tier: 2
    accessedAt: 2026-08-14
  - title: "CISA Urges Immediate Patching of Exploited Progress LoadMaster Vulnerability"
    url: "https://www.securityweek.com/cisa-urges-immediate-patching-of-exploited-progress-loadmaster-vulnerability"
    publisher: "SecurityWeek"
    tier: 2
    accessedAt: 2026-08-14
  - title: "Progress Kemp LoadMaster Flaw Hits CISA KEV After 792 Reported Exploit Attempts"
    url: "https://thehackernews.com/2026/08/progress-kemp-loadmaster-flaw-hits-cisa.html"
    publisher: "The Hacker News"
    tier: 2
    accessedAt: 2026-08-14
canonical: ""
---

CISA added a pre-authentication command injection flaw in Progress LoadMaster to its Known Exploited Vulnerabilities catalog on August 7, 2026, and gave federal agencies until August 10 to act. Progress had shipped the fix nine weeks earlier, on June 4.

That gap is the story. CVE-2026-8037 lets an unauthenticated attacker run commands as root on a LoadMaster appliance, and the exploitation attempts did not begin until watchTowr Labs published a full technical analysis and proof-of-concept on June 29 — three and a half weeks after patched builds were available. Anything still unpatched now has been reachable, with public exploit code, for six weeks.

Roughly 300 Kemp LoadMaster instances are exposed online, according to Shadowserver figures reported by BleepingComputer, though how many are honeypots or already patched is unknown. These are load balancers. They sit at the network edge with visibility into the services behind them, which is what makes the appliance worth taking rather than the flaw itself worth fearing.

## How a June patch became an August emergency

Syed Ibrahim Ahmed of TrendAI Research reported the flaw to Progress through the Zero Day Initiative on April 15, according to [watchTowr Labs](https://labs.watchtowr.com/enterprise-tech-in-shell-out-progress-kemp-loadmaster-uninitialized-heap-to-pre-auth-rce-cve-2026-8037/). Progress published its advisory and fixed releases on June 4. ZDI followed with coordinated advisory ZDI-26-342 on June 9.

Then watchTowr published its write-up on June 29, including a proof-of-concept. Exploitation attempts started the same day.

[eSentire's Threat Response Unit](https://www.esentire.com/security-advisories/progress-kemp-loadmaster-vulnerability-targeted-cve-2026-8037) saw those attempts from June 29 onward and reported that they were unsuccessful, with no post-compromise activity observed. Telemetry from KEVIntel, cited by [The Hacker News](https://thehackernews.com/2026/08/progress-kemp-loadmaster-flaw-hits-cisa.html), counted 792 attempts over 41 days from 65 unique IP addresses across 18 countries, with the last activity recorded on August 4.

Those two accounts measure different things. One counts attempts; the other counts successful compromises. **No source reviewed here names a victim or confirms a successful breach.**

## What is CVE-2026-8037?

CVE-2026-8037 is a command injection flaw in Progress LoadMaster that lets an unauthenticated attacker execute commands as root. It stems from an uninitialized heap read in the `escape_quotes()` function, reachable through the `apiuser` parameter of the `accessv2` API endpoint. Progress fixed it in GA 7.2.63.2 and LTSF 7.2.54.18, both released June 4, 2026.

## The bug is a missing null terminator

watchTowr's analysis traces the flaw to memory hygiene rather than input validation. The `escape_quotes()` function in the `access` executable allocates a heap buffer with `malloc()` and expands single quotes into it, but never writes a null terminator. Reads past the end of the intended data then run into whatever was in adjacent freed memory.

Progress's patch changes the `malloc()` call to `calloc()` and adds the terminator.

The Zero Day Initiative advisory describes the reachable path plainly: "The specific flaw exists within the handling of the apiuser parameter provided to the accessv2 endpoint. The issue results from the lack of proper initialization of memory prior to accessing it." Execution lands in the root context by way of a `system()` call.

## Which versions are affected

LoadMaster GA builds 7.2.63.1 and older are affected, along with LTSF builds 7.2.54.17 and older. The fixes are GA 7.2.63.2 and LTSF 7.2.54.18.

Three other Progress products ship the same vulnerable component in builds before GA 7.2.63.2: ECS Connection Manager, Connection Manager for ObjectScale, and MOVEit WAF.

One condition narrows the exposure. Exploitation is reachable only where the API is enabled, per the Progress advisory as summarized by eSentire and watchTowr. An appliance with the API disabled is not reachable by this path.

Severity is recorded inconsistently. CISA's KEV entry and most reporting cite CVSS 9.6, while the NVD change history carries a CVSS 3.1 vector that normalizes to 9.8. Neither figure changes what the flaw does.

## What to do now

Upgrade LoadMaster GA to 7.2.63.2 or later, and LTSF to 7.2.54.18 or later. If you run ECS Connection Manager, Connection Manager for ObjectScale, or MOVEit WAF, take those to GA 7.2.63.2 as well.

If you cannot patch immediately, disable the API or restrict it to trusted management networks. That reduces your exposure and does not remove the flaw.

Federal civilian agencies were bound by BOD 26-04 to remediate by August 10, 2026 — a three-day window from the [KEV listing](https://www.cisa.gov/news-events/alerts/2026/08/07/cisa-adds-one-known-exploited-vulnerability-catalog). CISA's required action also directs agencies to check for compromise that predates the patch, so treat patching as the start of the work rather than the end of it. [The Cisco ASA VPN flaw](/article/cisco-asa-vpn-flaw-exploited) reached the catalog days later on a similarly short clock.

eSentire attributed three source addresses to the observed attempts:

```
192.42.116[.]58
192.42.116[.]105
146.70.139[.]154
```

Hunt for unusual requests to `/accessv2`, unexpected command execution on the appliance, and outbound connections originating from it. An appliance patched after June 29 was exposed to public exploit code for some period, and the logs are the only thing that will tell you whether anyone took the shot.

## What is still unknown

No actor has been named. eSentire published source addresses without attributing them to a group, and neither CISA nor Progress has tied the activity to anyone.

Whether any of the 792 attempts succeeded is also unresolved. eSentire assessed that attempts are "highly probably" to increase given the public proof-of-concept and the appliance's value as an initial-access foothold — a forecast, made before the KEV listing, not a finding.

The number worth watching is the exposed-instance count. Roughly 300 appliances were reachable at last measurement, and the population that matters is whatever fraction of those never took the June build. The same pattern drove [the N-able N-central intrusions](/article/nable-ncentral-patch-bypass-exploited) this month: an edge management appliance, a fix that existed, and a window in which nobody applied it.
