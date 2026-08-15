# Editorial Standards

Read this before drafting. Self-check against it before writing the file.

Generic instructions like "write professionally" do not bind a language model. Explicit bans do. This document is deliberately prescriptive.

---

## Banned openers

Do not begin an article with any of these, or a variation:

- "In today's digital landscape..."
- "In an era where..."
- "As technology continues to evolve..."
- "Cybersecurity has become more important than ever..."
- "With cyberattacks on the rise..."
- "Imagine waking up to find..."
- Any rhetorical question. ("What would you do if your entire network were encrypted overnight?")
- Any definition of a term the audience already knows. ("Ransomware is a type of malware that...")

The opening sentence carries the single most newsworthy specific fact in the piece. Nothing else earns that position.

**Bad:** Ransomware attacks against edge devices are increasing across industries.

**Good:** Akira ransomware operators have been exploiting a SonicWall SSLVPN flaw since at least July 2026, security firm Arctic Wolf reported Monday.

---

## Banned vocabulary

| Banned | Use instead |
|---|---|
| delve into | examine, dig into |
| leverage (verb) | use, exploit |
| robust | specific: "survived 40 Gbps", "no known bypass" |
| seamless / seamlessly | (cut it) |
| landscape (figurative) | (cut it) |
| realm, tapestry, testament | (cut it) |
| navigate (figurative) | handle, deal with |
| unlock, empower | (cut it) |
| game-changer, cutting-edge, state-of-the-art | (cut it, or say what it actually does) |
| ever-evolving, rapidly evolving | (cut it) |
| bad actors | attackers, the threat group, the operators |
| threat landscape | (name the actual threats) |
| in the wild (overused) | fine once; not three times |
| crucial, vital, critical (as filler) | reserve "critical" for CVSS ratings |
| a treasure trove of | (cut it) |
| the aforementioned | (just name it again) |

---

## Banned patterns

**Transition chains.** Do not open consecutive paragraphs with "Furthermore," "Moreover," "Additionally," "In addition." If two paragraphs need a connective to relate, the ordering is wrong.

**Hedging preambles.** "It's important to note that," "It's worth mentioning that," "Notably," "Interestingly." Delete and state the thing.

**Tricolon padding.** "faster, smarter, and more secure." Three adjectives where one specific fact belongs.

**The summary conclusion.** No "In conclusion," no "To sum up," no closing paragraph that restates the article. End on forward-looking substance: what's unresolved, what to watch, what happens next.

**Metronomic paragraphs.** Three sentences, three sentences, three sentences. Vary it. Follow a long technical paragraph with a four-word one.

**Bullet-point reflex.** Prose is the default. Lists are for genuinely enumerable content:
- affected product versions
- indicators of compromise
- ordered mitigation steps

If a "list" item is a full sentence of explanation, it was a paragraph.

**Empty attribution.** "Experts say," "researchers warn," "according to security professionals." Name the person or the organization, or cut the claim.

**Fake balance.** Do not manufacture a counterpoint for a fact that isn't contested.

**Second person outside mitigation.** The body is reported in third person. Only the mitigation section addresses the reader directly.

---

## Required

**Specificity over adjectives.** Every place you reach for an intensifier, substitute a number. Not "a severe vulnerability" — "a CVSS 9.8 flaw." Not "many organizations" — "roughly 12,000 internet-exposed instances, per Shadowserver."

**Active voice with a named subject.** "Cisco patched the flaw on August 4" beats "the flaw was patched." Passive is acceptable when the actor is genuinely unknown: "the data was exfiltrated sometime before June."

**Nut graf by paragraph three.** After the news, one paragraph establishing why this matters to this audience. Scale, exposure, exploitation status.

**Quote handling.** Direct quotes need a named speaker, their affiliation, and where the quote came from. Never invent, paraphrase into quotation marks, or trim in a way that changes meaning. Two or three quotes per article is plenty.

**Timeline clarity.** Disclosure date, patch date, exploitation date, publication date. Readers need to know whether they've been exposed for two days or two months.

**Numbers with sources.** Any figure — victim count, exposed instances, ransom demand — carries an attribution in the same sentence or the one after.

---

## Tone calibration

Report the story straight. Urgency comes from the facts, not from the adjectives.

**Overwrought:** This devastating zero-day has sent shockwaves through the security community, leaving organizations scrambling to defend themselves against a relentless onslaught.

**Right:** The flaw is being exploited in the wild and no patch exists. CISA added it to the Known Exploited Vulnerabilities catalog on Thursday, giving federal agencies until August 21 to mitigate.

The second is more alarming than the first, because it's specific.

---

## Self-check before writing the file

Run through this list against your draft:

1. Does the first sentence contain a specific, novel fact?
2. Grep the draft for every term in the banned vocabulary table. Zero hits.
3. Do any two consecutive paragraphs open with a transition word?
4. Is there a closing summary paragraph? Delete it.
5. Does every number and quote have an attribution?
6. Is every CVE ID, version number, and date traceable to a fetched source?
7. Are confirmed, reported, and claimed facts distinguished by verb choice?
8. Read the paragraph lengths as a sequence. Is there variation?
9. Is second person confined to the mitigation section?
10. Would a SOC analyst learn something actionable, or just be told that security is important?
