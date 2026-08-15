---
title: "CVE-2026-8037 LoadMaster Patch: Exploited, Fix Now"
headline: "Progress Kemp LoadMaster Patch: CVE-2026-8037 Is Actively Exploited"
slug: kemp-loadmaster-command-injection-patch
description: "CVE-2026-8037 LoadMaster patch: a critical command injection in Kemp LoadMaster is actively exploited. Affected versions, IOCs, and what to fix first."
primaryKeyword: "CVE-2026-8037 LoadMaster patch"
secondaryKeywords:
  - "LoadMaster command injection"
  - "CISA KEV LoadMaster"
  - "LoadMaster 7.2.63.2"
  - "LoadMaster IOCs"
  - "LoadMaster mitigation"
category: vulnerabilities
tags: [cve-2026-8037, progress, kemp-loadmaster, command-injection, cisa-kev, edge-devices, watchtowr, esentire]
author:
  name: "Jordan Ellis"
  title: "Security Writer"
publishedAt: 2026-08-14
updatedAt: 2026-08-14
status: draft
cves:
  - CVE-2026-8037
sources:
  - title: "CISA Adds One Known Exploited Vulnerability to Catalog"
    url: "https://www.cisa.gov/news-events/alerts/2026/08/07/cisa-adds-one-known-exploited-vulnerability-catalog"
    publisher: "CISA"
    tier: 1
    accessedAt: 2026-08-14
  - title: "NVD - CVE-2026-8037"
    url: "https://nvd.nist.gov/vuln/detail/CVE-2026-8037"
    publisher: "NIST"
    tier: 1
    accessedAt: 2026-08-14
  - title: "Progress Kemp LoadMaster Vulnerability Targeted (CVE-2026-8037)"
    url: "https://www.esentire.com/security-advisories/progress-kemp-loadmaster-vulnerability-targeted-cve-2026-8037"
    publisher: "eSentire"
    tier: 1
    accessedAt: 2026-08-14
  - title: "Enterprise Tech In, Shell Out (Progress Kemp LoadMaster Uninitialized Heap to Pre-Auth RCE CVE-2026-8037)"
    url: "https://labs.watchtowr.com/enterprise-tech-in-shell-out-progress-kemp-loadmaster-uninitialized-heap-to-pre-auth-rce-cve-2026-8037/"
    publisher: "watchTowr Labs"
    tier: 1
    accessedAt: 2026-08-14
  - title: "Critical Progress LoadMaster flaw now actively exploited in attacks"
    url: "https://www.bleepingcomputer.com/news/security/cisa-warns-of-critical-progress-loadmaster-flaw-exploited-in-attacks"
    publisher: "BleepingComputer"
    tier: 2
    accessedAt: 2026-08-14
  - title: "Progress Kemp LoadMaster Flaw Hits CISA KEV After 792 Reported Exploit Attempts"
    url: "https://thehackernews.com/2026/08/progress-kemp-loadmaster-flaw-hits-cisa.html"
    publisher: "The Hacker News"
    tier: 2
    accessedAt: 2026-08-14
canonical: ""
---

## The CVE-2026-8037 LoadMaster patch is overdue for exposed appliances

A CVE-2026-8037 LoadMaster patch is the difference between a reachable and an unreachable appliance. CISA added the pre-authentication command-injection flaw in Progress Kemp LoadMaster to its Known Exploited Vulnerabilities catalog on 08/07/2026, according to the [KEV entry mirrored on the NVD page](https://nvd.nist.gov/vuln/detail/CVE-2026-8037). The listing gives Federal Civilian Executive Branch agencies a due date of 08/10/2026 under BOD 26-04. Active exploitation is the trigger for a KEV listing, so this one is confirmed being attacked.

For defenders, two numbers matter more than the CVSS score. Roughly 300 Kemp LoadMaster instances were internet-exposed as of this reporting, per [Shadowserver data cited by BleepingComputer](https://www.bleepingcomputer.com/news/security/cisa-warns-of-critical-progress-loadmaster-flaw-exploited-in-attacks) — the KEVIntel telemetry that The Hacker News published counts 792 exploitation attempts over 41 days from 65 unique IP addresses in 18 countries. The good news: Progress released fixed builds on June 4, so appliances on GA 7.2.63.2 or LTSF 7.2.54.18 are not exposed. The risk is concentrated on the unpatched remainder, and PoC is public.

## What happened

Research credit for the disclosure goes to Syed Ibrahim Ahmed of TrendAI Research via the Zero Day Initiative, per [watchTowr Labs' analysis](https://labs.watchtowr.com/enterprise-tech-in-shell-out-progress-kemp-loadmaster-uninitialized-heap-to-pre-auth-rce-cve-2026-8037/). Progress published its advisory and fixed releases on June 4, and [watchTowr followed with its technical write-up and proof-of-concept on June 29](https://labs.watchtowr.com/enterprise-tech-in-shell-out-progress-kemp-loadmaster-uninitialized-heap-to-pre-auth-rce-cve-2026-8037/). Exploitation attempts began the same day. eSentire's Threat Response Unit, which issued a [security advisory on the campaign](https://www.esentire.com/security-advisories/progress-kemp-loadmaster-vulnerability-targeted-cve-2026-8037), reported that the cases it observed were not successful and that no post-compromise activity was seen.

By August 4, KEVIntel had recorded its final activity of the tracked window: five attempts. CISA added the bug to the KEV catalog three days later. No source in this piece names a confirmed successful victim, and none attributes the attempts to a named threat group. The observed source IPs — 192.42.116[.]58, 192.42.116[.]105, and 146.70.139[.]154 — are reported by eSentire and republished by The Hacker News but not linked to any named actor.

## What's in the CVE-2026-8037 LoadMaster patch?

The CVE-2026-8037 LoadMaster patch replaces the `malloc()` call in the `escape_quotes()` function of the `access` executable with `calloc()` and writes a null terminator. That change fixes an uninitialized-heap out-of-bounds read that let an unauthenticated attacker run commands as root through the `/accessv2` endpoint. Upgrade to GA 7.2.63.2 or LTSF 7.2.54.18.

The same flaw is an OS command injection rated CVSS 9.6 across the public advisories, reachable by sending a crafted request that hits the `accessv2` API endpoint while the API is enabled. Per [watchTowr's diff of the `access` executable](https://labs.watchtowr.com/enterprise-tech-in-shell-out-progress-kemp-loadmaster-uninitialized-heap-to-pre-auth-rce-cve-2026-8037/), the vulnerable code allocates its output buffer with `malloc()`, expands single quotes, and never writes a null terminator, producing an out-of-bounds read from freed adjacent memory. The Zero Day Initiative advisory describes the path as "the lack of proper initialization of memory prior to accessing it," letting an attacker execute code in the context of root through the `apiuser` parameter.

## Who's affected

The vulnerable versions are:

- Kemp LoadMaster (General Availability): 7.2.63.1 and older → fixed in 7.2.63.2
- Kemp LoadMaster (Long Term Support Fix): 7.2.54.17 and older → fixed in 7.2.54.18

Progress disclosed the flaw on June 4 alongside CVE-2026-33691, and it also affects ECS Connection Manager, Connection Manager for ObjectScale, and all MOVEit WAF versions before GA v7.2.63.2, per [SecurityWeek's coverage](https://thehackernews.com/2026/08/progress-kemp-loadmaster-flaw-hits-cisa.html). Exploitation is reachable only when the API is enabled on the appliance, which narrows, but does not eliminate, the exposure.

Because LoadMaster appliances sit at the network edge with visibility into internal services, eSentire warns that a compromise "could facilitate initial access and further malicious activity within the environment."

## What to do now

If you run an affected version of the LoadMaster command injection, confirm your build first, then remediate in this order:

1. **Patch.** Upgrade GA to the LoadMaster 7.2.63.2 release or later, or LTSF to 7.2.54.18 or later. The same fixed version covers ECS Connection Manager, Connection Manager for ObjectScale, and MOVEit WAF. If you are a federal agency, meet the 08/10/2026 BOD 26-04 deadline.
2. **Restrict the API as an interim LoadMaster mitigation.** If you cannot patch immediately, disable or restrict API access to trusted management networks. This reduces exposure but is not a substitute for the fix, and patching is still required.
3. **Run forensic triage.** Per the KEV required action on the [NVD page](https://nvd.nist.gov/vuln/detail/CVE-2026-8037) and CISA's Forensics Triage Requirements, treat any pre-patch exposure as potentially compromised and check for signs of prior exploitation before you consider the box clean.
4. **Hunt for LoadMaster IOCs.** Block the three reported source addresses — 192.42.116[.]58, 192.42.116[.]105, 146.70.139[.]154 — and look for unusual requests to `/accessv2`, unexpected command execution, and outbound connections from the appliance, per eSentire's guidance.

This bug is one of several CISA Known Exploited Vulnerabilities additions in this period, alongside [the Cisco ASA VPN flaw](/article/cisco-asa-vpn-flaw-exploited). The CISA KEV LoadMaster entry and the 08/10/2026 due date set the federal remediation timeline, and BOD 26-04 is guidance any defender can treat as a baseline even where it does not legally apply.

## What's still unknown

No source confirms a successful compromise, so the open question is whether the tracked attempts — hundreds of them from 65 IPs — converted into a foothold anywhere, and against whom. The actor behind the attempts is unidentified. And the fraction of the roughly 300 internet-exposed instances that are honeypots, already patched, or genuinely vulnerable remains unknown. If your LoadMaster fleet is unpatched, assume the attempts are aimed at you and that the answer to the first question matters more than the CVSS score.
