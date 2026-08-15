---
title: "Gunra Ransomware: The Fortinet Door and the Linux Flaw"
headline: "Six Agencies Just Told You How Gunra Ransomware Gets In, and How Some Victims Can Get Out"
slug: gunra-ransomware-fortinet-linux-recovery
description: "Gunra ransomware enters through two patched Fortinet flaws and one named account. The advisory also documents a Linux key flaw that may let victims recover."
primaryKeyword: "Gunra ransomware"
secondaryKeywords:
  - "CVE-2024-55591"
  - "forticloud-sync"
  - "double extortion"
  - "R3ADM3.txt"
category: ransomware
tags: [ransomware, gunra, fortinet, cisa, fbi, conti, raas]
author:
  name: "Jordan Ellis"
  title: "Security Writer"
publishedAt: 2026-08-15
updatedAt: 2026-08-15
status: review
cves:
  - CVE-2024-55591
  - CVE-2025-24472
sources:
  - title: "#StopRansomware: Gunra Ransomware"
    url: "https://www.cisa.gov/news-events/cybersecurity-advisories/aa26-222a"
    publisher: "CISA"
    tier: 1
    accessedAt: 2026-08-15
  - title: "#StopRansomware: Gunra Ransomware (PDF)"
    url: "https://www.ic3.gov/CSA/2026/260810.pdf"
    publisher: "FBI Internet Crime Complaint Center"
    tier: 1
    accessedAt: 2026-08-15
  - title: "US and South Korea warn of Gunra ransomware targeting govt agencies"
    url: "https://www.bleepingcomputer.com/news/security/us-warns-of-gunra-ransomware-attacks-against-government-critical-infrastructure/"
    publisher: "BleepingComputer"
    tier: 2
    accessedAt: 2026-08-15
  - title: "FBI, South Korea warn of Gunra ransomware gang targeting critical infrastructure"
    url: "https://therecord.media/ransomware-south-korea-fbi-gunra"
    publisher: "The Record"
    tier: 2
    accessedAt: 2026-08-15
  - title: "CISA AA26-222A: Gunra Ransomware | SafeBreach Coverage"
    url: "https://www.safebreach.com/blog/gunra-ransomware-cert-alert-aa26-222a/"
    publisher: "SafeBreach"
    tier: 2
    accessedAt: 2026-08-15
canonical: ""
---

Six agencies published [joint advisory AA26-222A](https://www.cisa.gov/news-events/cybersecurity-advisories/aa26-222a) on 2026-08-10, and buried in its response guidance is something a ransomware advisory almost never carries: a way out without paying. Gunra ransomware's Linux encryptor seeds its key generator with `srand(time(NULL))`, and the FBI says file timestamps may be enough to reconstruct the keys.

The rest of the document is a lesson in how ordinary the entry point was.

Gunra actors got in overwhelmingly through [CVE-2024-55591](https://www.ic3.gov/CSA/2026/260810.pdf) and CVE-2025-24472, two authentication bypasses in Fortinet FortiOS and FortiProxy that have been patched since early 2025. The exploit does one memorable thing: it creates a super-user account called forticloud-sync with a hard-coded password. If that account exists on your firewall, you have your answer already.

## What happened

The advisory carries the FBI, CISA, the National Security Agency, the Department of Defense Cyber Crime Center, the Secret Service and the Republic of Korea's National Police Agency. Six signatures is a lot. The Korean input matters too, because a second way in comes from Korean investigators: VPN gateways facing the internet, taken through weak or default logins and SSH access-control gaps.

Gunra ransomware first appeared in April 2025, derived from the Conti source code leaked in 2022. It ran as a plain double extortion operation for most of a year. Steal the data, lock the files, threaten to publish. Then it scaled up.

By early 2026 the group was running a ransomware-as-a-service affiliate program on dark web forums, complete with a management panel, a configurable ransomware builder, cross-platform locker payloads and structured affiliate documentation. The FBI recorded a new brand name for the expansion, Golden Community. [BleepingComputer](https://www.bleepingcomputer.com/news/security/us-warns-of-gunra-ransomware-attacks-against-government-critical-infrastructure/), [The Record](https://therecord.media/ransomware-south-korea-fbi-gunra) and [SafeBreach](https://www.safebreach.com/blog/gunra-ransomware-cert-alert-aa26-222a/) all date the program launch to January 2026 specifically; the advisory text says only "as of early 2026".

The group also began recruiting penetration testers as initial access brokers, paying them a share of the ransom.

Chris Butera, acting executive assistant director for cybersecurity at CISA, put it flatly. "Gunra is another variant in the ongoing trend of ransomware attacks causing disruption and harm to U.S. and international organizations."

## How does Gunra ransomware get in?

Gunra ransomware exploits CVE-2024-55591 and CVE-2025-24472 in Fortinet FortiOS and FortiProxy to abuse scheduled tasks on the firewall. That creates a persistent super-user account named `forticloud-sync` carrying a hard-coded password. Where Fortinet devices are patched, actors instead use exposed or default VPN gateway credentials and SSH access-control weaknesses.

From there the tradecraft is plain and it works. Impacket's `secretsdump.py` pulls NTDS hashes off a domain controller, which feeds pass-the-hash and pass-the-ticket moves onward. The tools are all off-the-shelf: RClone, FileZilla, 7-Zip, WinRAR, DBeaver, MobaXterm, Sliver, even Slack and Visual Studio Code.

One trick earns its own paragraph. Against one victim, the actors edited the login-checking files on a virtual desktop portal so that one attacker-chosen one-time code would always pass. Multi-factor auth kept working. It kept looking healthy on the dashboards. It just also took a value the attackers picked.

Encryption is ChaCha20 with RSA-4096, multi-threaded, appending `.ENCRT` to encrypted files. A static ransom note named R3ADM3.txt goes into every affected directory. The binary skips re-encrypting notes and files it has already locked, which is a speed choice rather than a kindness. Victims get five to seven days to open talks. Demands run, in the advisory's phrasing, to "over tens of millions in US dollars", which The Record renders as typically exceeding $10 million.

## Who is affected

The advisory lists ten sectors: healthcare and public health, financial services and insurance, critical manufacturing and construction, transportation and logistics, government services and facilities, utilities, academia, media and communications, retail, and professional and nonprofit services. Victims appear across the Americas, Europe, the Middle East, Africa and Asia-Pacific.

No source gives a total victim count. Dragos counted at least four Gunra incidents against industrial organisations in Q2 2026, down from eight in Q1, within 1,140 industrial ransomware incidents overall.

The exposure is not really a product question. It is whether an edge device somewhere in your estate is still running a 2024 firmware image, which is the same failure that put the [Cisco ASA VPN flaw](/article/cisco-asa-vpn-flaw-exploited) into active exploitation this month.

## What to do now

Check for the account first. Search every Fortinet device for forticloud-sync. It takes minutes, and it is the single highest-value check in the advisory.

Then work the detection list:

- `WMIC shadowcopy delete` commands running before any encryption
- Anomalous access to NTDS.dit, and directory replication requests from anything that is not a domain controller
- RClone, FileZilla or AnyDesk appearing on servers that never had them
- Outbound SSH tunnels from network appliances to unfamiliar destinations
- Administrative sessions clustered between 22:00 and 06:00, the operators' working hours
- Mass renaming to `.ENCRT`, and R3ADM3.txt notes appearing in directories

Patch the two Fortinet CVEs if you somehow have not, and audit VPN gateways for default administrator credentials and missing lockout policies.

Back up on the assumption that the attacker will find your backups, because in at least one documented case they did. The actors deleted backup and archived data at both the primary data centre and the disaster recovery site. Offline and immutable is the advisory's recommendation, and this is why.

If you are hit and the extension is `.GNRA` rather than `.ENCRT`, stop and preserve everything before you do anything else. Keep the encrypted files, the file timestamps, the ransom notes and the system logs. The Linux variant's key generator is seeded with the system clock, and as of March 2026 that weakness may allow keys to be reconstructed mathematically from timestamps. Destroying the timestamps destroys the recovery path.

Four file hashes from the advisory, for your detection stack:

- `main.exe` `2dc70a12d158d437e45a55b1d52f3d61c6082a1e1667573302ba3b62813e2751`
- `main.exe` `834efe9b392c6c000877ea5613a079445affc16fe8af5997d68c55cafc95e5d1`
- `cryptor.exe` `91f8fc7a3290611e28a35a403fd815554d9d856006cc2ee91ccdb64057ae53b0`
- `msmp.exe` `a82e496b7b5279cb6b93393ec167dd3f50aff1557366784b25f9e51cb23689d9`

The advisory also lists IP addresses, ransom-negotiation email addresses, Tor addresses and qTox identifiers. Take those from the document itself rather than from any secondary write-up, this one included.

## What is still unknown

Whether anyone has actually recovered files using the Linux weakness. The advisory presents it as a possibility and a reason to preserve evidence, not as a finished decryptor.

Which Fortinet versions are affected. Neither the advisory nor any reporting reviewed here states the vulnerable FortiOS and FortiProxy ranges, which is an odd gap for the document's central entry point.

Whether Gunra has a nation-state dimension. BleepingComputer reports that a separate AhnLab advisory tied the group to North Korea's Lazarus, an operation also linked this month to a [Windows kernel zero-day](/article/windows-afd-zero-day-exploited). No other source reviewed repeats that link, and the joint advisory describes Gunra purely as financially motivated. Two agencies-worth of forensics and no attribution claim is itself a signal.

What "Golden Community" is. A rebrand, a parallel storefront, or an affiliate label is a meaningful distinction for anyone trying to track this operation across leak sites, and the advisory does not say.
