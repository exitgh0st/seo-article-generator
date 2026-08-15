---
url: "https://www.bleepingcomputer.com/news/security/us-warns-of-gunra-ransomware-attacks-against-government-critical-infrastructure/"
publisher: "BleepingComputer"
tier: 2
accessedAt: 2026-08-15
---

# US and South Korea warn of Gunra ransomware targeting govt agencies

## Background

U.S. federal agencies and South Korea's National Police Agency issued a joint advisory
warning about Gunra ransomware. According to the alert, "Gunra first emerged in April 2025
as a sophisticated double-extortion ransomware variant derived from the leaked Conti
ransomware source code."

## Attack Sectors

The ransomware targets various industries including healthcare, public health, financial
services, and government agencies worldwide.

## Exploitation Methods

Gunra exploits multiple Fortinet vulnerabilities:
- CVE-2024-55591 and CVE-2025-24472 in FortiOS and FortiProxy
- Credential exposure and SSH access control weaknesses in VPN gateways

The group initially focused on Windows but expanded to Linux campaigns in mid-2025.

## RaaS Program

Since January 2026, Gunra launched a formal ransomware-as-a-service platform. The advisory
states: "Gunra launched a formal RaaS affiliate program on dark web forums, providing
affiliates with access to a management panel, a configurable ransomware builder,
cross-platform locker payloads, and structured affiliate documentation."

The group adopted new branding aliases, notably "Golden Community," and actively recruits
penetration testers and ethical hackers as initial access brokers.

## Notable Findings

The FBI observed that "Gunra actors attempting to communicate directly with management
staff at victim companies via email to solicit ransom payments with limited success."

A separate advisory from AhnLab exposed links between Gunra and North Korea's Lazarus
Group.

## Recommended Defenses

Agencies advised patching vulnerabilities, network segmentation, and offline data backups.
