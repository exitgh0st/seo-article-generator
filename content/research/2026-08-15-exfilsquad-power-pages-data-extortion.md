# Research Brief: ExfilSquad and misconfigured Microsoft Power Pages

**Researched:** 2026-08-15
**Status:** ready

## Summary

A previously unknown extortion group calling itself ExfilSquad surfaced on 2026-07-26
naming roughly 15 organisations, and published data from 13 of them on 2026-08-07.
Fortra's research team reviewed the samples and concluded the group does hold real
data. The leading theory for how is not a vulnerability at all: Microsoft Power Pages
portals configured to grant the Anonymous Users web role read access to tables behind
Microsoft D365.

## Confirmed facts

- ExfilSquad posted its first leak-site update on 2026-07-26, naming approximately 15
  organisations [S1][S2][S4]
- An initial extortion deadline of 2026-08-05 was set [S2]
- On 2026-08-07 the group published data from 13 victims via torrents, totalling
  382.64 GB and approximately 27 million records [S1][S4]
- Sectors represented: government, education, financial services, manufacturing [S4]
- Fortra Intelligence and Research Experts (FIRE) reviewed the publicly released
  samples and confirmed their authenticity [S1][S4]
- Fortra found **no evidence of vulnerability exploitation and no ransomware** [S2]
- Fortra identified more than 10,000 potentially exposed Power Pages instances that
  are publicly accessible [S1]
- Wesco publicly confirmed awareness of a claim; see Claimed and Quotes below [S3]

### The mechanism [S1][S4]

Power Pages is a software-as-a-service platform for building public-facing business
sites, backed by Microsoft D365 CRM and ERP data. When the **Anonymous Users web role**
is granted
a table permission, "the table's data can be read by anyone visiting the site" [S1].
That is a configuration choice, not a flaw. Fortra assesses victims were likely
identified by crawling for misconfigured portals or by other enumeration [S1][S4].

Fortra's own framing, verbatim: "The leading theory on the initial attack vector that
enabled exfiltration is misconfigured Microsoft Power Page portals that allowed for
public read access." [S1] Note "leading theory" — Fortra does not present this as
settled.

Cybersecurity Dive renders the same finding as leaked data that "appears to be related
to misconfigured Microsoft Power Page portals", allowing "unauthorized access to
Microsoft D365" and "public read access" [S2].

### Victim data volumes, as reported by Cybersecurity Dive [S2]

- City of Atlanta: 36+ GB, 3 million records
- Allstate: 15+ GB, 657,000 records
- U.K. Department for Education: 440 MB, 600,000 records
- Frontier Airlines: 43 GB, 2.4 million records
- Microsoft: 130 GB, 8 million records

District of Columbia Public Schools: 60,000 records including student names, dates of
birth and identifiers [S1][S4].

## Reported

- Veranix initially disclosed the ExfilSquad claims in a July report [S2]
- Resecurity and VenariX have both previously reported ExfilSquad "targeted in the
  past improperly configured Microsoft Power Pages data tables" [S3]
- Zenith Bank Plc and Analog Devices appeared in the original victim list but were
  absent from the actual leaks [S1]
- Wesco is publicly believed to use Microsoft Dynamics 365, though Wesco has not
  disclosed the method [S3]

## Claimed

Everything below is ExfilSquad's assertion and is not confirmed by any victim or
researcher in the retrieved sources.

- Roughly 15 victim organisations [S1][S2][S4]
- 2.6 million Wesco records containing "customer and employee PII, account and contact
  data, CRM user profiles, credit and business identifiers, authentication metadata,
  and access information" [S3]
- 130 GB and 8 million records taken from Microsoft [S2]

**The Microsoft claim deserves particular caution.** It appears in the Cybersecurity
Dive volume table [S2] and nowhere else in the retrieved sources as a confirmed item.
No Microsoft statement was retrieved. Search results indicate a separate outlet has
questioned the strength of the evidence, but that page could not be fetched.

## Timeline

| Date | Event | Source |
|---|---|---|
| July 2026 | Veranix reports the initial claims | [S2] |
| 2026-07-26 | ExfilSquad leak-site post names ~15 organisations | [S1][S2][S4] |
| 2026-08-05 | Initial extortion deadline | [S2] |
| 2026-08-07 | Data from 13 victims published via torrents | [S1][S4] |
| 2026-08-11 | Wesco confirms awareness of the claim | [S3] |
| 2026-08-14 | Fortra research published | [S1] |

## Affected products and versions

None. This is a configuration state, not a version. Any Microsoft Power Pages site
that grants the Anonymous Users web role a table permission exposes that table's rows
to unauthenticated visitors [S1]. No CVE is associated with this activity in any
retrieved source, and Fortra explicitly found no evidence of exploitation [S2].

## Exploitation status

Not applicable in the usual sense. There is no vulnerability being exploited, no CVE,
no KEV entry and no patch. The exposure is live wherever the misconfiguration exists,
and Fortra counts 10,000+ publicly accessible Power Pages instances as potentially
exposed [S1].

## Attribution

ExfilSquad is self-named and previously unknown [S1][S2]. No source retrieved
attributes it to an established group, a nation state, or a known ransomware brand.
Fortra notes no ransomware was deployed [S2], which distinguishes this from a
conventional double-extortion operation.

## Quotes

> "The leading theory on the initial attack vector that enabled exfiltration is
> misconfigured Microsoft Power Page portals that allowed for public read access."
> — Fortra Intelligence and Research Experts, via [S1]

> "the table's data can be read by anyone visiting the site" — Fortra, on the
> Anonymous Users web role, via [S1]

> "Wesco is aware of a claim of CRM data exfiltration by a third party." — Jennifer
> Sniderman, Vice President of Corporate Communications, Wesco, via [S3]

> "no evidence of ransomware or other malicious software on its IT systems" — Wesco,
> via [S3]

> "not believe that payment card information, financial account information or other
> sensitive customer or employee data is at risk" — Wesco, via [S3]

## Mitigation

No patch exists because nothing is unpatched. The action is an audit: in every Power
Pages site, review table permissions attached to the Anonymous Users web role and
confirm that every table reachable that way is one you intend to publish [S1][S4].

## Conflicts between sources

**Confirmed versus claimed on Wesco.** ExfilSquad claims 2.6 million records including
authentication metadata and access information [S3]. Wesco confirms only that it is
aware of a claim, reports no ransomware, no business disruption, and says it does not
believe payment card, financial account or other sensitive data is at risk [S3]. These
two accounts are not reconcilable and both must be reported as what they are.

**Victim count.** ExfilSquad named roughly 15; 13 dumps materialised [S1][S4]. Zenith
Bank Plc and Analog Devices were named but did not appear in the leaks [S1], which
means the leak-site list overstated the group's holdings by at least two entries.

**How firm Fortra's finding is.** Fortra calls the Power Pages misconfiguration its
"leading theory" [S1], while Cybersecurity Dive's phrasing "appears to be related to"
[S2] and SC Media's "researchers theorize" [S4] all preserve the hedge. Nothing here
is a confirmed root cause. Do not write that Power Pages misconfiguration *was* the
cause.

## Open questions

- Whether Microsoft was actually breached, and at what scale. The 130 GB / 8 million
  record figure is ExfilSquad's claim, carried in one outlet, with no Microsoft
  response retrieved.
- What Wesco's actual exposure was, given the gap between the claim and the statement.
- Why two named organisations never appeared in the leaks.
- Whether the misconfiguration theory holds for every victim or only some.
- How many of the 10,000+ exposed Power Pages instances hold sensitive tables.
- Whether any regulator has opened an inquiry, particularly over the UK Department for
  Education and Police National Legal Database data.

## Suggested angles

1. **Defender-focused: audit the Anonymous Users web role today** — primary keyword:
   `Power Pages misconfiguration` — intent: am I exposed and what do I check — why it
   works: there is no patch to wait for, the check is concrete, and 10,000+ instances
   are potentially exposed right now.
2. **Claimed versus confirmed: reading an extortion leak site** — primary keyword:
   `ExfilSquad data extortion` — intent: analysis of how to weigh criminal claims.
3. **SaaS misconfiguration as a breach class** — primary keyword: `SaaS data exposure`
   — intent: strategic.

## Sources
- [S1] "Researchers Confirm ExfilSquad's Access to Sensitive Data" — Infosecurity Magazine — Tier 2 — https://www.infosecurity-magazine.com/news/exfilsquads-13-organizations/ — accessed 2026-08-15
- [S2] "Researchers confirm breach claims by data-extortion group" — Cybersecurity Dive — Tier 2 — https://www.cybersecuritydive.com/news/researchers-confirm-breach-claims-data-extortion/827926/ — accessed 2026-08-15
- [S3] "Wesco confirms security incident after ExfilSquad claims data theft" — BleepingComputer — Tier 2 — https://www.bleepingcomputer.com/news/security/wesco-confirms-security-incident-after-exfilsquad-claims-data-theft/ — accessed 2026-08-15
- [S4] "ExfilSquad data extortion group linked to 13 victim data leaks" — SC Media — Tier 2 — https://www.scworld.com/brief/exfilsquad-data-extortion-group-linked-to-13-victim-data-leaks — accessed 2026-08-15

**Fetch failures:** cuinfosecurity.com ExfilSquad article (HTTP 403);
it-connect.tech article on the Microsoft claim (DNS resolution failed). Fortra's own
research post was not located as a first-party URL despite a site-scoped search of
fortra.com, so **every Fortra statement in this brief is second-hand** through
Infosecurity Magazine, Cybersecurity Dive and SC Media.

A note on tiering. `docs/sources.md` places first-party incident disclosures and
vendor threat research in Tier 1, and this story has both: Wesco's own statement and
Fortra's research. Neither was reached first-party, so the brief carries Tier 1
*material* through Tier 2 outlets rather than clean Tier 1 sourcing. Reporting on
"Dataverse exports" appeared in search snippets but in none of the pages actually
fetched, so this brief does not use the term. No Tier 1 source exists for this story: there is no vendor advisory, no CVE and
no government alert, because there is no vulnerability. The Wesco statement in [S3] is
the closest thing to first-party material here.
