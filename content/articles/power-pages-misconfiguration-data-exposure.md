---
title: "Power Pages Misconfiguration Exposed 27 Million Records"
headline: "There Is No Patch for This One: 27 Million Records Leaked Through a Setting"
slug: power-pages-misconfiguration-data-exposure
description: "A Power Pages misconfiguration is the leading theory behind ExfilSquad's 382 GB leak. No CVE, no patch, and 10,000 instances potentially exposed right now."
primaryKeyword: "Power Pages misconfiguration"
secondaryKeywords:
  - "ExfilSquad"
  - "Anonymous Users web role"
  - "Microsoft D365"
  - "data extortion"
category: breaches
tags: [microsoft, power-pages, exfilsquad, data-extortion, saas, misconfiguration]
author:
  name: "Jordan Ellis"
  title: "Security Writer"
publishedAt: 2026-08-15
updatedAt: 2026-08-15
status: review
cves: []
sources:
  - title: "Researchers Confirm ExfilSquad's Access to Sensitive Data"
    url: "https://www.infosecurity-magazine.com/news/exfilsquads-13-organizations/"
    publisher: "Infosecurity Magazine"
    tier: 2
    accessedAt: 2026-08-15
  - title: "Researchers confirm breach claims by data-extortion group"
    url: "https://www.cybersecuritydive.com/news/researchers-confirm-breach-claims-data-extortion/827926/"
    publisher: "Cybersecurity Dive"
    tier: 2
    accessedAt: 2026-08-15
  - title: "Wesco confirms security incident after ExfilSquad claims data theft"
    url: "https://www.bleepingcomputer.com/news/security/wesco-confirms-security-incident-after-exfilsquad-claims-data-theft/"
    publisher: "BleepingComputer"
    tier: 2
    accessedAt: 2026-08-15
  - title: "ExfilSquad data extortion group linked to 13 victim data leaks"
    url: "https://www.scworld.com/brief/exfilsquad-data-extortion-group-linked-to-13-victim-data-leaks"
    publisher: "SC Media"
    tier: 2
    accessedAt: 2026-08-15
canonical: ""
---

A group calling itself ExfilSquad published 382.64 GB of stolen data on 2026-08-07, roughly 27 million records taken from 13 organisations, and [researchers at Fortra](https://www.infosecurity-magazine.com/news/exfilsquads-13-organizations/) who reviewed the samples say the data is real. What they did not find was an exploit.

No vulnerability. No CVE. No ransomware. Fortra's leading theory is a Power Pages misconfiguration.

That distinction matters for how you respond. There is nothing to patch here, which means nothing will arrive to fix it for you, and the same setting that exposed the City of Atlanta's records is available in every Power Pages site your organisation runs. Fortra counts more than 10,000 publicly accessible instances that could be exposed.

## What happened

The data extortion group ExfilSquad surfaced on 2026-07-26 with a single leak-site post naming roughly 15 organisations across government, education, financial services and manufacturing. It set an extortion deadline of 2026-08-05. When that passed, [the group published](https://www.scworld.com/brief/exfilsquad-data-extortion-group-linked-to-13-victim-data-leaks) data from 13 of them via torrents.

The volumes reported by [Cybersecurity Dive](https://www.cybersecuritydive.com/news/researchers-confirm-breach-claims-data-extortion/827926/) are large. The City of Atlanta at 36 GB and 3 million records. Frontier Airlines at 43 GB and 2.4 million. Allstate at 15 GB and 657,000. The U.K. Department for Education at 440 MB and 600,000. District of Columbia Public Schools lost 60,000 records carrying student names, dates of birth and identifiers.

Two organisations named in the original post, Zenith Bank Plc and Analog Devices, never appeared in the leaks at all. A leak-site victim list is marketing, and this one overstated the group's holdings by at least two entries.

Then there is the Microsoft entry: 130 GB and 8 million records, per ExfilSquad. That is the group's claim, carried in one outlet. No Microsoft statement was retrieved for this article, and no researcher quoted here has confirmed it.

## What is the Power Pages misconfiguration, and how does it expose data?

Power Pages is Microsoft's platform for building public-facing business websites backed by Microsoft D365 data. Every site has an Anonymous Users web role for unauthenticated visitors. Grant that role a table permission and, in Fortra's words, "the table's data can be read by anyone visiting the site". No credentials, no exploit, no alert.

That is the whole mechanism. It is a checkbox behaving exactly as designed.

Fortra assesses that victims were probably found by crawling for misconfigured portals or by similar enumeration. Nobody had to break in. Someone had to look.

Read Fortra's phrasing carefully, because the hedge is doing real work: "The leading theory on the initial attack vector that enabled exfiltration is misconfigured Microsoft Power Page portals that allowed for public read access." Leading theory. Cybersecurity Dive renders it as data that "appears to be related to" the misconfiguration, and SC Media writes that researchers "theorize" it. Not one of them states a confirmed root cause, and neither does this article.

What Fortra does state plainly is the negative finding. No evidence of vulnerability exploitation, and no ransomware deployed.

## Who is affected

Anyone running Microsoft Power Pages with a table permission attached to the Anonymous Users web role. A Power Pages misconfiguration has no version range, because it is a configuration state rather than a defect. A fully patched site is exposed if the setting is wrong, and an outdated one is safe if it is right.

Fortra's figure of 10,000-plus publicly accessible Power Pages instances is a count of sites that could be checked, not sites confirmed exposed.

The confirmed-versus-claimed gap is worth watching in the individual cases. ExfilSquad claims 2.6 million Wesco records including "authentication metadata, and access information". Wesco's Vice President of Corporate Communications Jennifer Sniderman said only that "Wesco is aware of a claim of CRM data exfiltration by a third party", reported "no evidence of ransomware or other malicious software on its IT systems", and said the company does "not believe that payment card information, financial account information or other sensitive customer or employee data is at risk". Both statements are on the record. They do not reconcile, and neither should be reported as the other.

## What to do now

Finding a Power Pages misconfiguration is a manual audit, and it is quick. Open each site, list the table permissions attached to the Anonymous Users web role, and confirm that every table reachable that way is one you meant to publish. That is the entire remediation, and no vendor is going to do it for you.

Extend the same check to any SaaS platform where a public-facing site is backed by an internal data store. The pattern generalises well beyond Microsoft D365.

Then assume your portal was crawled. There is no exploit signature to hunt because no exploit occurred, so your logs will show ordinary reads from ordinary HTTP clients. Look at request volumes against portal endpoints instead, particularly bulk pagination over a table you did not intend to expose.

If your data is already in the dump, treat every field in the exposed tables as public and work outward from there. Contact details enable phishing, and identifiers enable the account-recovery attacks that follow. The credentials-outlive-the-incident lesson from the [Metabase SQL injection](/article/metabase-sql-injection-exploited-zero-day) applies here too, with the difference that this time nobody needed admin to read the data.

One thing not to do is wait for a KEV entry. This will not get one. There is no CVE to add, which is precisely why a [ransomware advisory](/article/gunra-ransomware-fortinet-linux-recovery) with a patch list is in some ways an easier problem than this one.

## What is still unknown

Whether Microsoft was breached, and at what scale. The 130 GB claim rests on ExfilSquad's own leak-site accounting.

What Wesco actually lost. The gap between 2.6 million records and "we do not believe sensitive data is at risk" is wide enough to drive a regulator through.

Why Zenith Bank Plc and Analog Devices were named but never leaked. Either the group failed to get the data, or it chose not to publish it, and those are very different facts about its capabilities.

Whether the Power Pages misconfiguration theory covers every victim or only some. Fortra has not said it does, and the hedging in all three write-ups suggests the answer is not yet settled.

Whether any regulator has opened an inquiry. U.K. Department for Education and Police National Legal Database records are in the dump, and as of 2026-08-15 no source reviewed here reports an investigation.
