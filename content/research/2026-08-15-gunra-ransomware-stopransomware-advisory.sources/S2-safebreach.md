---
url: "https://www.safebreach.com/blog/gunra-ransomware-cert-alert-aa26-222a/"
publisher: "SafeBreach"
tier: 2
accessedAt: 2026-08-15
---

# CISA AA26-222A: Gunra Ransomware | SafeBreach Coverage

## Threat Overview

SafeBreach characterizes Gunra as a "Conti-derived double-extortion variant also branded
Golden Community" that emerged in April 2025. The operation expanded into a structured
ransomware-as-a-service model by January 2026, recruiting initial access brokers and
penetration testers. Victims span healthcare, finance, critical infrastructure, and
government sectors globally.

## Exploitation Chain

Initial Access. The advisory documents exploitation of FortiOS authentication bypasses:
- CVE-2024-55591
- CVE-2025-24472

Both flaws enable creation of a persistent super-user account named forticloud-sync with
hardcoded credentials. Actors also exploited credential exposure and SSH weaknesses in
internet-facing VPN gateways.

## Key TTPs (MITRE ATT&CK Mapped)

Credential Access (primary emphasis):
- "NTDS credential dumping using Impacket's secretsdump.py against compromised domain
  controllers"
- Network sniffing to capture VDI login credentials
- Session cookie theft and reuse
- MFA bypass via authentication-process modification
- Extraction of symmetric encryption keys from access-control servers

Lateral Movement:
- SMB via Impacket's psexec.py and smbclient.py
- RDP into internal VDI environments using stolen session data
- Pass-the-hash and pass-the-ticket techniques

Defense Evasion:
- Deletion of system and network access logs
- Clearing command history
- Deliberate timing of activity between "10:00 p.m. to 06:00 a.m." to avoid detection
- IsDebuggerPresent API to frustrate reverse engineering
- Selective file exclusion (Windows, Program Files directories; .exe, .dll, .sys
  extensions)

Impact:
- Encryption using "ChaCha20 + RSA-4096" with .ENCRT, .CRYPT, or .GNRA extensions
- WMI-driven Volume Shadow Copy deletion prior to encryption
- Data exfiltration via Mega and FTP (FileZilla)
- Deployment of main.exe targeting "Microsoft OneDrive and SharePoint for cloud data
  theft"
- Static ransom note (R3ADM3.txt) with five-to-seven-day negotiation deadline

## IOCs and Identifiers

File Hashes: the advisory provides SHA-256 hashes for four malicious files: two main.exe
variants, cryptor.exe, and msmp.exe. SafeBreach did not reproduce the hash values.

Infrastructure:
- Clearnet mirror domain: datapub[.]news (June-July 2025)
- Three Tor .onion DLS addresses spanning April 2025 to July 2026
- Four ProtonMail/Gmail ransom-negotiation addresses
- Four qTox IDs
- IP addresses from June-December 2025

Account Artifact: malicious Fortinet user account forticloud-sync

## Recovery Opportunity

SafeBreach notes a weakness in "Gunra's Linux ELF variant (.GNRA)" discovered March 2026:
"Its encryption keys use a weak pseudorandom number generator seeded with the predictable
srand(time(NULL))." File timestamps may enable mathematical key reconstruction without
ransom payment.

## SafeBreach Simulation Coverage

Existing simulations validating behaviors: NTDS dumping (IDs 6807, 7223), pass-the-hash
lateral movement (2273), RDP lateral movement (6473), SMB lateral movement (483, 6513,
6550), indicator removal (2245), Shadow Copy manipulation (6372), and SharePoint
exfiltration (10975).

New IOC coverage: Simulation 11754 validates outbound HTTP communication with Gunra
command-and-control infrastructure per the advisory.
