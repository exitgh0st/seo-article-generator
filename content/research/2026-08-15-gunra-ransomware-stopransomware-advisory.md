# Research Brief: Gunra ransomware joint advisory AA26-222A

**Researched:** 2026-08-15
**Status:** ready

## Summary

Six agencies published joint advisory AA26-222A on 2026-08-10, covering Gunra, a
Conti-derived double-extortion ransomware that became a ransomware-as-a-service
operation in early 2026. Initial access is overwhelmingly through two patched
FortiOS and FortiProxy authentication bypasses. The advisory also documents a
weakness in Gunra's Linux encryptor that may let victims recover files without
paying.

## Confirmed facts

Sourced to the joint advisory [S1] unless noted.

- Product ID AA26-222A, published 2026-08-10, TLP:CLEAR [S1]
- Co-authored by the FBI, CISA, the DoD Cyber Crime Center, the NSA, the Secret
  Service and the Republic of Korea's National Police Agency [S1]
- Gunra first emerged in April 2025, a double-extortion variant "derived from the
  leaked Conti ransomware source code" [S1][S4]
- Conti source code leaked in 2022 [S1]
- As of early 2026, Gunra ran a RaaS affiliate program on dark web forums with a
  management panel, a configurable ransomware builder, cross-platform locker
  payloads and structured affiliate documentation [S1][S4]
- The FBI observed the group adopting new branding aliases, "notably operating
  under the name Golden Community" [S1][S4]
- Gunra recruits penetration testers and ethical hackers as initial access brokers
  for a share of ransom profits [S1]
- Initial access: CVE-2024-55591 and CVE-2025-24472 in FortiOS and FortiProxy,
  which "allow threat actors to exploit scheduled tasks on vulnerable FortiOS
  firewall devices to create a new, malicious persistent user forticloud-sync with
  super user privileges and a hard-coded password" [S1]
- Also observed: credential exposure and SSH access-control weaknesses on
  internet-facing VPN gateways [S4]
- Encryption: "ChaCha20 + RSA-4096", multi-threaded, parallel [S1]
- Encrypted file extension `.ENCRT`; `.CRYPT` in one documented sample from July
  2025; `.GNRA` on the Linux variant [S1][S2]
- Ransom note filename `R3ADM3.txt`, written to each affected directory; the binary
  skips re-encrypting notes and already-encrypted files [S1]
- Negotiation window of five to seven days via a Tor portal or qTox [S1]
- Ransom demands "over tens of millions in US dollars" [S1]; The Record renders
  this as typically exceeding $10 million [S5]
- Shadow copy deletion via WMI:
  `cmd.exe /c C:\Windows\System32\wbem\WMIC.exe shadowcopy where "ID='{guid of shadowcopy}'" delete` [S1]
- Against one victim, actors deleted backup and archived data at both the primary
  data centre and the disaster recovery centre [S1]
- Credential access: Impacket `secretsdump.py` against domain controllers to pull
  NTDS hashes (T1003.003), enabling pass-the-hash (T1550.002) and pass-the-ticket
  (T1550.003) [S1]
- MFA bypass: actors modified authentication processing files on a victim's VDI
  authentication portal server so that a specific Gunra-designated one-time
  password value always authenticated (T1556.006) [S1]
- Initial access mapped to T1190, Exploit Public-Facing Application [S1]
- Clearnet mirror of the leak site at `datapub.news`, June to July 2025; by March
  2026 the Tor leak site had moved to a different .onion address [S1]
- Leak-site previews show a directory listing of a victim's OneDrive and SharePoint
  files, not file contents [S1]
- Legitimate tools used: FileZilla, Amass, RClone, Sliver, 7-Zip, WinRAR, DBeaver,
  Slack, Microsoft Visual Studio Code, MobaXterm, Impacket [S1]
- Victim sectors per the advisory: healthcare and public health; financial services
  and insurance; critical manufacturing and construction; transportation systems
  and logistics; government services and facilities; utilities; academia; media and
  communications; retail; professional and nonprofit services [S1]
- Victim geography: the Americas, Europe, Middle East, Africa and Asia-Pacific [S1]
- As of March 2026, the Linux ELF variant (`.GNRA`) seeds its key PRNG with
  `srand(time(NULL))`; defenders "may leverage this to mathematically reconstruct
  the keys using file timestamps and recover files without paying the ransom" [S1]

### Validated SHA-256 hashes, Table 4 [S1]

Each was checked to be exactly 64 hex characters after reassembly from the PDF.

- `main.exe` — `2dc70a12d158d437e45a55b1d52f3d61c6082a1e1667573302ba3b62813e2751` — tool to exfiltrate OneDrive and SharePoint
- `main.exe` — `834efe9b392c6c000877ea5613a079445affc16fe8af5997d68c55cafc95e5d1` — tool to exfiltrate OneDrive and SharePoint
- `cryptor.exe` — `91f8fc7a3290611e28a35a403fd815554d9d856006cc2ee91ccdb64057ae53b0` — malicious executable
- `msmp.exe` — `a82e496b7b5279cb6b93393ec167dd3f50aff1557366784b25f9e51cb23689d9` — malicious executable

## Reported

- Gunra began on Windows and expanded to Linux campaigns in mid-2025 [S4]
- The RaaS program launched specifically in January 2026 [S2][S4][S5]
- Operator activity concentrated between 22:00 and 06:00 [S2][S6]
- Anti-analysis via the `IsDebuggerPresent` API; encryption skips the Windows and
  Program Files directories and `.exe`, `.dll`, `.sys` extensions [S2]
- Exfiltration via Mega and FTP using FileZilla [S2]
- The Linux key-recovery finding is credited to Breakglass Intelligence research [S6]
- Dragos counted 1,140 ransomware incidents against industrial organisations in Q2
  2026, up 12% on Q1, of which at least four were attributed to Gunra, against
  eight in Q1 [S5]

## Claimed

- BleepingComputer reports that "a separate advisory from AhnLab exposed links
  between Gunra and North Korea's Lazarus Group" [S4]. No other source retrieved
  repeats this, and the joint advisory itself makes no nation-state attribution.
  Treat as a single-source claim.

## Timeline

| Date | Event | Source |
|---|---|---|
| 2022 | Conti source code leaked | [S1] |
| April 2025 | Gunra first emerges | [S1][S4] |
| June–July 2025 | Clearnet leak-site mirror at datapub.news | [S1] |
| Mid-2025 | Linux campaigns begin | [S4] |
| July 2025 | `.CRYPT` extension seen in one sample | [S1] |
| January 2026 | Formal RaaS affiliate program launches | [S2][S4][S5] |
| March 2026 | Tor leak site moves; Linux PRNG weakness identified | [S1] |
| 2026-08-10 | Joint advisory AA26-222A published | [S1] |

## Affected products and versions

Gunra is not a product vulnerability. The exposure is CVE-2024-55591 and
CVE-2025-24472 in Fortinet FortiOS and FortiProxy, both patched since early 2025
[S1][S6]. **No source retrieved states the affected FortiOS or FortiProxy version
ranges**, and this brief does not supply them.

## Exploitation status

Both entry-point CVEs are known-exploited and long patched [S6]. Gunra is active as
of the advisory date. No source retrieved gives a total victim count.

## Attribution

The joint advisory attributes nothing to a nation-state. It describes Gunra as a
financially motivated criminal RaaS operation [S1]. The AhnLab-to-Lazarus link
appears only in BleepingComputer's report [S4] and is not corroborated elsewhere in
the retrieved sources.

## Quotes

> "Gunra is another variant in the ongoing trend of ransomware attacks causing
> disruption and harm to U.S. and international organizations." — Chris Butera,
> acting executive assistant director for cybersecurity, CISA, via [S5]

> "Gunra first emerged in April 2025 as a sophisticated double-extortion ransomware
> variant derived from the leaked Conti ransomware source code." — AA26-222A, via [S1][S4]

> "the encryption keys use a weak pseudorandom number generator (PRNG) seeded with
> the predictable system srand(time(NULL))" — AA26-222A, via [S1]

> "Gunra actors attempting to communicate directly with management staff at victim
> companies via email to solicit ransom payments with limited success." — AA26-222A,
> via [S1][S4][S5]

## Mitigation

Per the advisory [S1]: prioritise patching known exploited vulnerabilities in
internet-facing systems including VPN gateways and RDP-exposed infrastructure;
implement and test offline, immutable backups stored in a physically separate,
segmented location. Mitigations are aligned to the CISA/NIST Cross-Sector
Cybersecurity Performance Goals.

If a Linux variant is involved, preserve encrypted files, file timestamps, ransom
notes and system logs before anything else, because the `.GNRA` PRNG weakness may
allow key reconstruction [S1].

Hunting signals [S1][S6]: creation of a `forticloud-sync` account on Fortinet
devices; `WMIC shadowcopy delete` preceding encryption; anomalous NTDS.dit access;
directory replication requests from non-domain-controllers; unexpected RClone,
FileZilla or AnyDesk on servers; outbound SSH tunnels from network appliances;
administrative sessions clustered between 22:00 and 06:00.

## Conflicts between sources

**When the RaaS program launched.** The advisory text says "As of early 2026" [S1].
SafeBreach, BleepingComputer and The Record all give January 2026 specifically
[S2][S4][S5]. The specific month is not stated in the advisory text retrieved.

**Ransom demand size.** The advisory says "over tens of millions in US dollars"
[S1]; The Record renders it as typically exceeding $10 million [S5]. These are not
the same figure.

**Nation-state links.** BleepingComputer cites an AhnLab advisory tying Gunra to
Lazarus [S4]. The joint advisory does not [S1]. Report both positions.

## Open questions

- Total victim count. No source retrieved gives one.
- Which FortiOS and FortiProxy versions are affected.
- Whether the Linux key-reconstruction technique has been successfully used to
  recover a real victim's files, or is so far theoretical.
- Whether "Golden Community" is a rebrand, a parallel brand or an affiliate label.
- The IP addresses, email addresses, Tor addresses and qTox IDs in Tables 2 and 3.
  These are present in the advisory but did not survive text extraction from the
  PDF in a form that can be reproduced with confidence, so this brief omits them
  rather than risk publishing a mistyped indicator. Readers should take them from
  the advisory directly.

## Suggested angles

1. **Defender-focused: close the Fortinet door, then hunt the account** — primary
   keyword: `Gunra ransomware` — intent: am I exposed and what do I do — why it
   works: the entry point is two long-patched CVEs and one named account, the
   detection signals are concrete, and the Linux recovery path is genuinely
   actionable news for a victim.
2. **The MFA backdoor: authentication that still looks healthy** — primary keyword:
   `MFA bypass ransomware` — intent: deep technical.
3. **RaaS industrialisation: Conti's code, five years on** — primary keyword:
   `ransomware as a service` — intent: strategic context.

## Sources
- [S1] "#StopRansomware: Gunra Ransomware" — CISA — Tier 1 — https://www.cisa.gov/news-events/cybersecurity-advisories/aa26-222a — accessed 2026-08-15
- [S2] "CISA AA26-222A: Gunra Ransomware | SafeBreach Coverage" — SafeBreach — Tier 2 — https://www.safebreach.com/blog/gunra-ransomware-cert-alert-aa26-222a/ — accessed 2026-08-15
- [S3] "#StopRansomware: Gunra Ransomware (PDF)" — U.S. Department of Defense — Tier 1 — https://media.defense.gov/2026/Aug/10/2003976697/-1/-1/0/CSA_STOPRANSOMWARE_GUNRA_RANSOMWARE.PDF — accessed 2026-08-15
- [S4] "US and South Korea warn of Gunra ransomware targeting govt agencies" — BleepingComputer — Tier 2 — https://www.bleepingcomputer.com/news/security/us-warns-of-gunra-ransomware-attacks-against-government-critical-infrastructure/ — accessed 2026-08-15
- [S5] "FBI, South Korea warn of Gunra ransomware gang targeting critical infrastructure" — The Record — Tier 2 — https://therecord.media/ransomware-south-korea-fbi-gunra — accessed 2026-08-15
- [S6] "Gunra ransomware: how it gets in and how to spot it" — Hard2bit — Tier 3 — https://hard2bit.com/en/blog/gunra-ransomware-joint-advisory-vpn-mfa-backdoor/ — accessed 2026-08-15

**Fetch failures:** cisa.gov/news-events/cybersecurity-advisories/aa26-222a (HTTP
403); media.defense.gov PDF (HTTP 403); databreaches.net republication (HTTP 403).
The advisory itself was retrieved successfully from the FBI IC3 mirror at
ic3.gov/CSA/2026/260810.pdf and its text extracted, so primary sourcing is intact.
Note that [S1] and [S3] are the same document and count as one source.
