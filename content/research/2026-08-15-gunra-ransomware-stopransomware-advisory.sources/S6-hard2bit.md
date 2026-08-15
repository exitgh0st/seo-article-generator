---
url: "https://hard2bit.com/en/blog/gunra-ransomware-joint-advisory-vpn-mfa-backdoor/"
publisher: "Hard2bit"
tier: 3
accessedAt: 2026-08-15
---

# Gunra ransomware: how it gets in and how to spot it

## Overview

On August 10, 2026, six cybersecurity agencies (FBI, CISA, NSA, US Secret Service, DoD
Cyber Crime Center, and South Korea's National Police Agency) released advisory AA26-222A
detailing the Gunra ransomware operation.

## Initial Access Vectors

Fortinet Vulnerabilities. The FBI documents initial access primarily through two known
authentication bypass flaws in FortiOS and FortiProxy:
- CVE-2024-55591 and CVE-2025-24472, both patched since early 2025
- Exploitation installs a persistent super-user account named "forticloud-sync" designed to
  evade detection

Weak VPN Gateway Credentials. Korean investigators identified a second access pattern:
- Internet-facing VPN gateways compromised through weak credentials
- SSH access-control weaknesses
- Default SSL-VPN administrator credentials on devices without lockout policies

## The MFA Backdoor Technique

The most sophisticated finding involved a virtual desktop infrastructure (VDI) portal
compromise. After gaining network administrator access, attackers:

1. Exploited VPN appliance features to capture user credentials and session data
2. Hijacked sessions using stolen cookies to impersonate legitimate users
3. Modified authentication validation files on the VDI authentication server to accept a
   single, attacker-chosen one-time password
4. Maintained MFA appearance: the second factor remained visible to users and auditors, but
   validation logic was compromised

## Post-Compromise Tactics

- Dumped NTDS files using Impacket's secretsdump tool
- Executed pass-the-hash and pass-the-ticket lateral movement
- Accessed SSH-secured servers to retrieve symmetric keys
- Decrypted enterprise password databases
- Deployed encryptors against critical infrastructure

The toolbox was entirely mundane: RClone, FileZilla, 7-Zip, AnyDesk, DBeaver, Visual Studio
Code, making detection difficult without behavioral analysis.

## Detection Signals

Windows Environment:
- "WMIC shadowcopy delete" commands preceding encryption
- Anomalous access to NTDS.dit files
- Directory replication requests from non-domain-controller systems
- Unexpected RClone, FileZilla, or AnyDesk installation on servers

Network Edge:
- New local accounts on firewalls (the forticloud-sync account)
- Outbound SSH tunnels from network appliances to unknown destinations
- Administrative sessions concentrated between 22:00-06:00 (operators' active window)

Encryption Indicators (Late-Stage):
- Mass file renaming to .ENCRT extension
- R3ADM3.txt ransom notes in directories

## Linux Variant Weakness

A design flaw affects the Linux encryptor. According to Breakglass Intelligence research,
the key generator uses "srand(time(NULL))", seeding with the system clock. File timestamps
can potentially reveal encryption keys, allowing recovery without ransom payment. The
official advisory explicitly recommends preserving encrypted files and timestamps as a
recovery pathway.

## Mitigation Priorities

1. Immediate patching of exposed VPN and RDP infrastructure
2. Mandatory second-factor authentication on all services
3. Review of new or dormant privileged accounts
4. Command-line tool restrictions
5. Network segmentation to contain lateral movement
6. Immutable, offline backups in segregated locations (attackers deleted backups at primary
   and disaster recovery sites in documented incidents)

This summary reflects information from advisory AA26-222A and associated third-party
research available as of August 13, 2026.
