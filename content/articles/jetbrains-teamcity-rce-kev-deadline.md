---
title: "JetBrains TeamCity RCE Exploited, CISA Deadline Passed"
headline: "The CISA Deadline for This TeamCity RCE Has Already Passed"
slug: jetbrains-teamcity-rce-kev-deadline
description: "JetBrains TeamCity On-Premises has an unauthenticated RCE exploited in the wild. Affected versions, the patch plugin, and why the CISA deadline has passed."
primaryKeyword: "jetbrains teamcity"
secondaryKeywords:
  - "CVE-2026-63077"
  - "TeamCity On-Premises"
  - "CISA KEV"
  - "unsafe deserialization"
category: vulnerabilities
tags: [jetbrains, teamcity, ci-cd, cisa-kev, deserialization, rapid7]
author:
  name: "Jordan Ellis"
  title: "Security Writer"
publishedAt: 2026-08-14
updatedAt: 2026-08-14
status: draft
cves:
  - CVE-2026-63077
sources:
  - title: "Critical Security Issue Affecting TeamCity On-Premises (CVE-2026-63077)"
    url: "https://blog.jetbrains.com/teamcity/2026/07/cve-2026-63077/"
    publisher: "JetBrains"
    tier: 1
    accessedAt: 2026-08-14
  - title: "CISA Adds One Known Exploited Vulnerability to Catalog"
    url: "https://www.cisa.gov/news-events/alerts/2026/08/05/cisa-adds-one-known-exploited-vulnerability-catalog"
    publisher: "CISA"
    tier: 1
    accessedAt: 2026-08-14
  - title: "CVE-2026-63077: Critical unauthenticated remote code execution in JetBrains TeamCity"
    url: "https://www.rapid7.com/blog/post/etr-cve-2026-63077-critical-unauthenticated-remote-code-execution-in-jetbrains-teamcity"
    publisher: "Rapid7"
    tier: 1
    accessedAt: 2026-08-14
  - title: "Rapid7 Analysis: Unauthenticated Remote Code Execution in JetBrains TeamCity (CVE-2026-63077)"
    url: "https://www.rapid7.com/blog/post/ra-unauthenticated-rce-in-jetbrains-teamcity-cve-2026-63077"
    publisher: "Rapid7 Labs"
    tier: 1
    accessedAt: 2026-08-14
  - title: "CVE-2026-63077 Detail"
    url: "https://nvd.nist.gov/vuln/detail/CVE-2026-63077"
    publisher: "NVD"
    tier: 1
    accessedAt: 2026-08-14
  - title: "CISA Flags TeamCity CVE-2026-63077 RCE Flaw Under Active Exploitation in the Wild"
    url: "https://thehackernews.com/2026/08/cisa-flags-teamcity-cve-2026-63077-rce.html"
    publisher: "The Hacker News"
    tier: 2
    accessedAt: 2026-08-14
  - title: "Hackers Start Exploiting Recent JetBrains TeamCity Vulnerability"
    url: "https://www.securityweek.com/hackers-start-exploiting-recent-jetbrains-teamcity-vulnerability"
    publisher: "SecurityWeek"
    tier: 2
    accessedAt: 2026-08-14
canonical: ""
---

CISA added an unauthenticated remote code execution flaw in JetBrains TeamCity to its [Known Exploited Vulnerabilities catalog](https://www.cisa.gov/news-events/alerts/2026/08/05/cisa-adds-one-known-exploited-vulnerability-catalog) on August 5, 2026, and set a federal remediation deadline of August 8. That deadline has passed.

CVE-2026-63077 carries a CVSS score of 9.8 and affects every version of TeamCity On-Premises. An attacker needs no credentials — two HTTP requests to the agent polling protocol are enough to run operating system commands as the TeamCity server process.

A build server is a bad thing to lose. It holds deployment credentials, signing material and source access, and it writes the artifacts that everything downstream trusts. Rapid7 Labs published a working proof-of-concept on August 7, two days after the KEV listing, so the exploit is no longer something an attacker has to develop.

## A twelve-day gap between patch and KEV listing

Antoni Tremblay reported the flaw privately to JetBrains on July 10 under coordinated disclosure. [JetBrains published its advisory](https://blog.jetbrains.com/teamcity/2026/07/cve-2026-63077/) on July 27 along with fixed builds, and said at the time it had no knowledge of active exploitation. Rapid7 followed with an emergent threat response post on July 29.

The CISA KEV listing on August 5 changed that picture. Inclusion in the catalog is CISA's assertion that a flaw is being exploited, and it started a three-day clock for federal civilian agencies under BOD 26-04.

JetBrains had not updated its advisory to confirm exploitation as of The Hacker News' August 6 coverage. Two things are true at once here: CISA says the flaw is being exploited, and the vendor has not independently said so.

## What is CVE-2026-63077?

CVE-2026-63077 is an unsafe deserialization flaw in JetBrains TeamCity On-Premises that lets an unauthenticated attacker run arbitrary operating system commands as the server process. It is reachable over HTTP or HTTPS through the agent polling protocol. JetBrains fixed it in TeamCity 2025.11.7 and 2026.1.3, released July 27, 2026, and shipped a patch plugin for older builds.

## The bug is an allowlist that never removed the defaults

The root cause is narrower than "deserialization is dangerous", and [Rapid7 Labs' analysis](https://www.rapid7.com/blog/post/ra-unauthenticated-rce-in-jetbrains-teamcity-cve-2026-63077) is worth reading in full.

TeamCity builds an XStream allowlist of the protocol classes it expects. The mistake is that it adds those classes to XStream's existing default permissions rather than starting from deny-by-default. Those defaults already permit the `Map` and `Throwable` hierarchies, so the allowlist ends up additive instead of exclusive.

Stephen Fewer of Rapid7 described the fix precisely: "A patched TeamCity server remediates this by adding `NoTypePermission.NONE` before the TeamCity allowlist, which removes the default permissions and makes the allowlist exclusive."

The chain runs through a `SchemaMismatchException`, which qualifies as a runtime exception and is therefore allowed under the default `Throwable` hierarchy, into `org.apache.commons.dbcp2.BasicDataSource` and TeamCity's bundled HyperSQL database.

Reaching it takes two requests. An unauthenticated POST to `/app/agents/v1/register` returns a `TeamCity-AgentSessionId` header. A second POST carrying that header sends crafted XML to `/app/agents/v1/commands/error`.

## Which JetBrains TeamCity versions are affected

All JetBrains TeamCity On-Premises versions are affected. There is no unaffected older branch to sit on.

The fixes are 2025.11.7 and 2026.1.3. For installations too old to take either, JetBrains released a security patch plugin covering TeamCity 2017.1 and later, which addresses this flaw and nothing else.

TeamCity Cloud is not affected. JetBrains stated it found no evidence of Cloud environments being exploited.

Nothing in the sources reviewed here quantifies how many servers are exposed, or how many have been compromised. That absence complicates any attempt to judge urgency from outside: there is no exposure count to measure a fleet against, and no victim disclosure to reason from. The KEV listing is the only public signal, and it is binary.

## What to do now

Upgrade to TeamCity 2025.11.7 or 2026.1.3, through the web UI's update path or a manual install. If your installation is too old, install the security patch plugin for 2017.1 and later instead — it is a targeted fix, not a substitute for upgrading.

Assume compromise if your server was internet-facing and unpatched after August 5. CISA's required action for KEV entries points at its forensic triage guidance, and a build server that ran unpatched through a period of confirmed exploitation deserves that treatment rather than a patch and a shrug. Rotate deployment credentials, signing keys and API tokens held by the server, and review recent build artifacts for changes you cannot account for.

JetBrains recommends restricting network access to trusted networks, putting internet-facing servers behind a VPN, running the server with minimum operating system privileges, and keeping it on a dedicated host separate from build agents. Rapid7 makes the same first point: limit reachability to the systems and people that need it.

If you run Rapid7's scanning products, vulnerability checks have been available since the July 28 content release.

## What is still unknown

Nobody has said who is exploiting this. [SecurityWeek](https://www.securityweek.com/hackers-start-exploiting-recent-jetbrains-teamcity-vulnerability) reported no public information on the attacks, and The Hacker News said the same about the actors, the method and the scale. CISA's KEV entry asserts exploitation without describing it.

That leaves the most useful question unanswerable for now: whether the exploitation CISA observed predates Rapid7's proof-of-concept or follows it. The answer determines whether this is a small number of capable operators or the beginning of broad opportunistic scanning.

The pattern is familiar from [the Cisco ASA VPN flaw added to the catalog days later](/article/cisco-asa-vpn-flaw-exploited) — infrastructure that administers other systems is worth more to an attacker than the box itself, which is the same reason the [N-able N-central intrusions](/article/nable-ncentral-patch-bypass-exploited) mattered beyond the servers running it. A CI/CD server sits in that category, and the deadline for treating it that way was six days ago.
