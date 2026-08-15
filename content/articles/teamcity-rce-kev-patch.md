---
title: "TeamCity CVE-2026-63077 Patch: RCE Fix Under KEV"
headline: "TeamCity CVE-2026-63077 Patch: The Agent-Polling RCE Is Under Active Exploitation"
slug: teamcity-rce-kev-patch
description: "TeamCity CVE-2026-63077 patch: an unauthenticated agent-polling RCE is under active exploitation. Affected versions, mitigation, and the KEV deadline."
primaryKeyword: "TeamCity CVE-2026-63077 patch"
secondaryKeywords:
  - "TeamCity agent polling RCE"
  - "CVE-2026-63077 affected versions"
  - "TeamCity KEV"
  - "TeamCity XStream deserialization"
category: vulnerabilities
tags: [jetbrains, teamcity, cve-2026-63077, cisa-kev, rce, deserialization, cicd]
author:
  name: "Jordan Ellis"
  title: "Security Writer"
publishedAt: 2026-08-14
updatedAt: 2026-08-14
status: review
cves:
  - CVE-2026-63077
sources:
  - title: "Critical Security Issue Affecting TeamCity On-Premises (CVE-2026-63077)"
    url: "https://blog.jetbrains.com/teamcity/2026/07/cve-2026-63077/"
    publisher: "The JetBrains Blog"
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
    publisher: "Rapid7"
    tier: 1
    accessedAt: 2026-08-14
  - title: "CISA Flags TeamCity CVE-2026-63077 RCE Flaw Under Active Exploitation in the Wild"
    url: "https://thehackernews.com/2026/08/cisa-flags-teamcity-cve-2026-63077-rce.html"
    publisher: "The Hacker News"
    tier: 2
    accessedAt: 2026-08-14
  - title: "NVD - CVE-2026-63077"
    url: "https://nvd.nist.gov/vuln/detail/CVE-2026-63077"
    publisher: "NIST NVD"
    tier: 1
    accessedAt: 2026-08-14
  - title: "Hackers Start Exploiting Recent JetBrains TeamCity Vulnerability"
    url: "https://www.securityweek.com/hackers-start-exploiting-recent-jetbrains-teamcity-vulnerability"
    publisher: "SecurityWeek"
    tier: 2
    accessedAt: 2026-08-14
canonical: ""
---

## CISA counted CVE-2026-63077 as exploited, and the federal deadline has passed

CISA added [CVE-2026-63077](https://nvd.nist.gov/vuln/detail/CVE-2026-63077), an unauthenticated remote code execution flaw in JetBrains TeamCity On-Premises, to its [Known Exploited Vulnerabilities catalog](https://www.cisa.gov/news-events/alerts/2026/08/05/cisa-adds-one-known-exploited-vulnerability-catalog) on August 5 after evidence of active exploitation. The entry carried a remediation due date of August 8 for US civilian agencies under Binding Operational Directive 26-04 — a deadline that has now passed.

The TeamCity CVE-2026-63077 patch is not optional for anyone running a self-hosted server: this is a CVSS 9.8 deserialization-of-untrusted-data bug, and every default configuration is affected. An attacker who can reach a TeamCity server over HTTP or HTTPS can exploit the agent polling protocol without credentials and execute operating system commands with the privileges of the TeamCity server process, JetBrains [said in its advisory](https://blog.jetbrains.com/teamcity/2026/07/cve-2026-63077/).

TeamCity is where many organizations build, test, and sign the software they ship, so a compromise is not a single-server event. Depending on the process privileges, a successful attack can expose stored credentials, modify server state, and compromise the integrity of build artifacts and the downstream CI/CD pipeline. That is broader than the usual edge-device foothold, and it is why the flaw's TeamCity KEV entry — alongside [the Windows AFD zero-day](/article/windows-afd-zero-day-exploited) — belongs to the same urgent class for anyone running a build system.

## What happened: disclosure, patches, then KEV

Security researcher Antoni Tremblay reported the vulnerability to JetBrains privately on July 10, 2026, under the company's coordinated disclosure policy. JetBrains published its advisory on July 27 with fixed versions 2025.11.7 and 2026.1.3, plus a [security patch plugin](https://blog.jetbrains.com/teamcity/2026/07/cve-2026-63077/) for TeamCity 2017.1 and later.

At publication, JetBrains stated it was not aware of any active exploitation. Roughly a week later, CISA's KEV addition — which requires confirmed real-world exploitation — overrode that. The agency's [august alert](https://www.cisa.gov/news-events/alerts/2026/08/05/cisa-adds-one-known-exploited-vulnerability-catalog) asked federal agencies to patch within three days, per BOD 26-04, and to follow "Forensics Triage Requirements" that assume a system may have been compromised before the patch was applied.

## Which TeamCity versions are vulnerable to CVE-2026-63077?

The CVE-2026-63077 affected versions are broad, and there are no exemptions: every JetBrains TeamCity On-Premises version before 2025.11.7 or 2026.1.3 is vulnerable, and the two fixed releases shipped on July 27, 2026. TeamCity Cloud is not affected, and JetBrains said it verified no evidence of Cloud environments being exploited. A [security patch plugin](https://blog.jetbrains.com/teamcity/2026/07/cve-2026-63077/) covers TeamCity 2017.1 and later for installations that cannot upgrade. On servers running 2017.1 through 2018.1 the plugin requires a restart after install; from 2018.2 onward it enables without one.

## How the unauthenticated RCE works

According to [technical research from Rapid7](https://www.rapid7.com/blog/post/ra-unauthenticated-rce-in-jetbrains-teamcity-cve-2026-63077), the root cause is a permissive include list in the XStream serialization library TeamCity bundles. TeamCity's vulnerable XStreamHolder adds the protocol's allowed classes on top of XStream's existing default permissions, which already permit the Map and Throwable type hierarchies. A hierarchy permission covers implementations and subclasses, not just the named type, so those defaults expose enough object-construction and reconstruction callbacks to assemble a working gadget chain. The flaw is, at bottom, a TeamCity XStream deserialization problem: the configured classes are meant to be an exclusive allowlist, but XStream evaluates them alongside its own earlier defaults.

The chain begins with TeamCity's HSQLMetadataStorage$SchemaMismatchException, a RuntimeException subclass accepted under the default Throwable permission. Its exact declared fields lead XStream to an Apache Commons DBCP BasicDataSource, which loads TeamCity's bundled HyperSQL database — no explicit element name is needed, so the DBCP class is never rejected by name. The patched version clears the defaults with NoTypePermission.NONE before the allowlist is applied, making it deny-by-default, and rejects the SchemaMismatchException class outright because it is absent from the protocol allowlist.

The trigger for this unauthenticated TeamCity agent polling RCE needs no credentials. An unauthenticated POST to `/app/agents/v1/register` returns a `TeamCity-AgentSessionId` header; the attacker then sends crafted XML to `/app/agents/v1/commands/error` with that session header, and the error handler, `handleCommandIsFailedRequest`, deserializes the request body before any authentication that would protect a human session applies. Rapid7 compared the vulnerable 2026.1.2 build against patched 2026.1.3 to confirm the fix closes the chain. According to [The Hacker News](https://thehackernews.com/2026/08/cisa-flags-teamcity-cve-2026-63077-rce.html), Rapid7 published a [proof-of-concept script](https://github.com/sfewer-r7/CVE-2026-63077) that writes a `.JSPWS` file to execute an arbitrary command, then deletes the file.

## Who's affected

All TeamCity On-Premises installations are in scope until they reach one of the two fixed versions, because the flaw reaches the server purely over HTTP(S) without authentication. The vulnerable surface is the agent polling channel under `/app/agents/v1`, not just the login screen — access to those endpoints remains unauthenticated, per Rapid7. Organizations exposing TeamCity to the internet, or running it with broad operating-system privileges, face the worst outcome.

## What the TeamCity CVE-2026-63077 patch requires

Patch first, and treat it as urgent. The TeamCity CVE-2026-63077 patch ships in either 2025.11.7 or 2026.1.3 — apply it through the automatic update in the TeamCity UI or by downloading a fixed build. If you cannot upgrade, install JetBrains' security patch plugin (TeamCity 2017.1+), which addresses CVE-2026-63077 specifically; note that it does not carry the other security fixes in a full upgrade.

Assume a vulnerable server may already be compromised. Follow CISA's forensics-triage guidance, which BOD 26-04 makes mandatory for federal agencies: confirm whether an attacker had a foothold before you apply the TeamCity CVE-2026-63077 patch, check for the artifacts a public PoC would leave (a served `.JSPWS` file), and rotate any credentials — especially stored build and deployment credentials — that the TeamCity server process could reach.

Then harden what remains. Per JetBrains and Rapid7: restrict network access to the server to only users and systems that need it, require a VPN for internet-facing deployments, run the server with the minimum operating-system privileges needed to operate, and keep it on a dedicated host separate from build agents. Treat build-artifact signing keys and pipeline secrets as potentially exposed.

## What's still unknown

No public information identifies who is exploiting the flaw or at what scale; both The Hacker News and SecurityWeek report the attackers are unconfirmed, and JetBrains had not updated its advisory to name them as of this writing. That matters because it is unclear whether these are opportunistic scans or a campaign aimed at software-supply-chain targets, where the payoff — signed artifacts and pipeline credentials — is far larger. Because a functional proof of concept is public, expect the window between unpatched and actively-targeted to close quickly, even for servers that are not internet-exposed.
