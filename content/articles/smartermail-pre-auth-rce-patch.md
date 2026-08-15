---
title: "SmarterMail Pre-Auth RCE: Patch Now Before It's Too Late"
headline: "SmarterMail's Silent Patch: A 10/10 RCE You May Have Missed"
slug: smartermail-pre-auth-rce-patch
description: "SmarterMail CVE-2025-52691 is a pre-auth RCE with a 10/10 CVSS score, silently patched in build 9413. Learn the exploit details and check your version now."
primaryKeyword: "smartermail"
secondaryKeywords:
  - "CVE-2025-52691"
  - "pre-auth RCE"
  - "SmarterTools"
  - "silent patch"
  - "build 9413"
category: vulnerabilities
tags: [smartermail, rce, cve-2025-52691, smartertools, email-server, patch-management]
author:
  name: "Jordan Ellis"
  title: "Security Writer"
publishedAt: 2026-08-15
updatedAt: 2026-08-15
status: published
cves:
  - CVE-2025-52691
sources:
  - title: "“The bugs pick you”: Inside Wouter’s security research journey"
    url: "https://www.microsoft.com/en-us/msrc/blog/2026/01/inside-wouters-security-journey"
    publisher: "Microsoft"
    tier: 1
    accessedAt: 2026-08-15
  - title: "Do Smart People Ever Say They’re Smart? (SmarterTools SmarterMail Pre-Auth RCE CVE-2025-52691)"
    url: "https://labs.watchtowr.com/do-smart-people-ever-say-theyre-smart-smartertools-smartermail-pre-auth-rce-cve-2025-52691/"
    publisher: "watchTowr Labs"
    tier: 1
    accessedAt: 2026-08-15
  - title: "At Mythos Speed: A Defender's Playbook for the AI Vulnerability Surge in 2026"
    url: "https://www.recordedfuture.com/blog/ai-vulnerability-playbook"
    publisher: "Recordedfuture"
    tier: 1
    accessedAt: 2026-08-15
  - title: "Microsoft Patch Tuesday - September 2025"
    url: "https://www.rapid7.com/blog/post/em-patch-tuesday-september-2025/"
    publisher: "Rapid7"
    tier: 1
    accessedAt: 2026-08-15
  - title: "Insightconnect Jira Workflow"
    url: "https://discuss.rapid7.com/t/insightconnect-jira-workflow/35647"
    publisher: "Rapid7 Discuss"
    tier: 1
    accessedAt: 2026-08-15
  - title: "Cyber vulnerability sweep picks up Royal Navy drones sending data to China"
    url: "https://www.theregister.com/edge-and-iot/2026/08/10/cyber-vulnerability-sweep-picks-up-royal-navy-drones-sending-data-to-china/5285430"
    publisher: "theregister"
    tier: 2
    accessedAt: 2026-08-15
  - title: "ShinyHunters Exploits Oracle PeopleSoft Zero-Day (CVE-2026-35273) to Breach Universities"
    url: "https://thehackernews.com/2026/06/shinyhunters-exploits-oracle-peoplesoft.html"
    publisher: "The Hacker News"
    tier: 2
    accessedAt: 2026-08-15
canonical: ""
---

## SmarterMail shipped a silent patch for a 10/10 pre-auth RCE, three months before anyone was told

SmarterTools fixed a pre-authentication remote code execution flaw in SmarterMail with a CVSS score of 10/10 in build 9413, released 10 October 2025, but did not disclose the vulnerability until Singapore's Cyber Security Agency (CSA) published its advisory at the end of December, according to a [watchTowr Labs analysis](https://labs.watchtowr.com/do-smart-people-ever-say-theyre-smart-smartertools-smartermail-pre-auth-rce-cve-2025-52691/) published in January 2026.

The vulnerability, [CVE-2025-52691](https://labs.watchtowr.com/do-smart-people-ever-say-theyre-smart-smartertools-smartermail-pre-auth-rce-cve-2025-52691/), was discovered by Mr Chua Meng Han from Singapore's Centre for Strategic Infocomm Technologies (CSIT). It allows an unauthenticated attacker to achieve remote code execution on a SmarterMail server. No authentication, no user interaction, no special conditions, just network access to the mail server's web interface.

If you run SmarterMail, this is the one to check before Monday. The patch has been out for ten months, but the silent fix means many administrators may not have applied it, or may not know why it matters. The newest build at the time of watchTowr's writing was 9483, so any install still on build 9406 or earlier is exposed.

## What happened

The timeline matters here. SmarterTools released build 9413 on 10 October 2025 with the fix baked in. The CVE entry and CSA advisory did not appear until the end of December 2025. That is a roughly three-month gap where the vulnerability was patched but not publicly documented.

watchTowr explicitly questions whether someone figured out the silently patched vulnerability before the advisory was published. The researchers do not answer that question, but the concern is reasonable: a 10/10 pre-auth RCE in a widely deployed mail server is exactly the kind of bug that gets weaponized quickly once discovered.

The vulnerable endpoint is `FileUploadController`, registered to `/api/upload` with `AllowAnonymous = true`, no authentication required. The patch added GUID validation to the `Upload` method. The `PostUploadProcessingTargetData` class contains a public `guid` property with a public setter, controllable via JSON deserialization. That combination is what turns an unauthenticated file upload into full remote code execution.

## Why the silent patch is the story

Vendors ship silent patches for a few reasons. Sometimes the fix is trivial and the vendor wants to avoid drawing attention. Sometimes the vulnerability was reported privately and the vendor is waiting for the researcher's disclosure timeline. Sometimes the vendor simply hopes nobody notices.

The problem for administrators is that a silent patch gives you no signal. Your update cadence becomes the only thing standing between your mail server and a 10/10 RCE. If you update SmarterMail when a new build appears, you are fine. If you update on a schedule, or when an advisory catches your eye, you were exposed for months without knowing it.

SmarterTools has not publicly explained why the fix shipped without a corresponding advisory. The CSA advisory and CVE entry at the end of December are the first public documentation of the flaw.

## Technical detail: how the exploit works

The chain is straightforward. The `FileUploadController` endpoint at `/api/upload` is marked `AllowAnonymous = true`, meaning it requires no authentication. The `Upload` method accepts a `PostUploadProcessingTargetData` object, which includes a `guid` property with a public setter. That property is controllable via JSON deserialization.

The pre-auth RCE works by sending a crafted JSON payload to the upload endpoint. The GUID validation added in build 9413 blocks the attack by verifying that the GUID supplied in the request matches an expected value. Without that validation, an attacker can supply arbitrary values that lead to code execution on the server.

watchTowr's write-up walks through the full chain. The short version: unauthenticated access to an upload endpoint, a deserialization issue, and a missing validation check that together add up to a perfect CVSS score.

## Who is affected

SmarterMail build 9406 is vulnerable. Build 9413 is not. Any installation older than 9413, including builds that predate 9406, is also exposed.

SmarterMail is a Windows-based mail server product used by hosting providers and businesses that want an alternative to [Microsoft](https://www.microsoft.com/en-us/msrc/blog/2026/01/inside-wouters-security-journey) Exchange. It is not as widely deployed as Exchange, but it is common enough in the hosting and SMB space that a pre-auth RCE is a serious concern. Internet-exposed instances are the obvious target, but the endpoint is reachable from any network position that can reach the web interface.

## What to do now

Check your SmarterMail version immediately. If you are on build 9406 or earlier, update to build 9413 or later right now. The current build is well past 9413, so any recent update will include the fix.

Do not assume your update process handled this. If you deferred an update because the release notes did not mention a security fix, you may have skipped the exact build that closes this hole. Verify the build number directly rather than trusting that "we update regularly" covers it.

After updating, check whether the endpoint was already exploited. Look for unexpected files in the SmarterMail web root, particularly under upload paths. Review web server logs for POST requests to `/api/upload` from unfamiliar IP addresses. If you find evidence of compromise, treat it as a full incident, an attacker with code execution on a mail server has access to credentials, mailboxes, and potentially the underlying Windows host.

If you cannot update immediately, restrict access to the `/api/upload` endpoint at the perimeter. This is a stopgap, not a fix, the endpoint is used for legitimate file uploads, so blocking it entirely may break functionality. But a broken upload feature is preferable to a compromised mail server.

## What is still unknown

Whether CVE-2025-52691 was exploited in the wild before the advisory appeared remains an open question. watchTowr raises it but does not answer it. There is no public evidence of exploitation, but the silent patch window is exactly the kind of gap that attackers look for.

Why SmarterTools chose not to disclose the fix at release time is also unexplained. The company has not commented publicly on the disclosure timeline.

And the broader pattern is worth watching. A 10/10 pre-auth RCE in a mail server, patched silently, disclosed months later, that is the kind of vulnerability that gets folded into exploit kits and scanning campaigns. If you have not checked your SmarterMail build yet, that is the takeaway. The patch exists. The question is whether you applied it.

## Related

- [Cisco Secure Firewall Flaw Exploited: Patch Now](/article/cisco-secure-firewall-flaw-patch)
- [Windows AFD Zero-Day Exploited by Lazarus Before Patch](/article/windows-afd-zero-day-exploited)
