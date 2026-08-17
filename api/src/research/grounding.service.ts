import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toProse } from '../seo/seo-score';
import type { ArticleFrontmatter } from '../seo/article.types';

/**
 * Checks an article's hard facts against the text of the pages that were actually
 * fetched during research.
 *
 * CLAUDE.md's first non-negotiable is "never invent a fact", and its second is
 * "every factual claim traces to a URL in the sources frontmatter". In the CLI
 * workflow both held because the writing model was the same one that had read the
 * sources, following an instruction it understood. Neither assumption survives the
 * move to a smaller model driving itself, so the rules run as code.
 *
 * CVE identifiers are the hard gate: they are unambiguous, trivially verifiable,
 * and the single most damaging thing to get wrong under a professional byline.
 * Version strings and CVSS scores are reported as warnings instead — they are
 * genuinely prone to false positives, because a source may write "7.1.3-4021" as
 * "7.1.3 build 4021", and blocking on that would teach the operator to ignore the
 * check.
 *
 * Indicators of compromise — defanged IP addresses and file hashes — are the
 * second hard gate, added after a comparison run in which two independently
 * written articles both published the same six IP addresses as network IOCs and
 * neither address appeared anywhere in the retained text of any of the eight
 * sources. Both articles passed the CVE gate cleanly. An IOC is worse than a
 * wrong CVE in one specific way: a reader acts on it directly, blocking an
 * address or hunting a hash, and a fabricated one sends them after nothing while
 * a transcription error can send them after somebody innocent.
 *
 * Only the unambiguous forms block. A defanged address (`192.0.2.1[.]` style) is
 * never a version number, and a 32/40/64-character hex string is never prose. A
 * *plain* dotted quad is ambiguous with exactly the kind of build number this
 * beat is full of — `7.2.63.2` is a real LoadMaster release — so it warns
 * instead, for the same reason version strings do.
 */

export interface GroundingReport {
  briefId: string;
  sourceCount: number;
  /** CVE IDs in the article that appear in no fetched source. Blocks the save. */
  unsourcedCves: string[];
  /** CVE IDs confirmed present in at least one source, with which ones. */
  groundedCves: { cve: string; sources: string[] }[];
  /**
   * Defanged IP addresses and file hashes that appear in no fetched source.
   * Blocks the save, same as an unsourced CVE.
   */
  unsourcedIndicators: string[];
  /** Indicators confirmed present in at least one source, with which ones. */
  groundedIndicators: { indicator: string; sources: string[] }[];
  /** Softer checks — reported to the operator, never blocking. */
  warnings: string[];
}

/**
 * Hyphens in a CVE identifier are not reliably hyphens.
 *
 * Publishers set identifiers with a non-breaking hyphen so a line wrap cannot
 * split them, and text extraction preserves it: CISA's Known Exploited
 * Vulnerabilities catalogue prints `CVE‑2025‑24813`, with U+2011 in both
 * positions. An article written normally spells the same identifier with ASCII
 * hyphens, so a literal comparison says the source never mentioned it and the
 * gate blocks a claim that is perfectly well sourced — the worst kind of
 * failure here, because it teaches the operator that the gate cries wolf.
 *
 * So both sides are folded to ASCII before anything is compared, and the
 * pattern matches either spelling.
 */
const DASHES = /[‐-―−－]/g;
/** Soft hyphen. Invisible, and wrapped web text is full of them. */
const SOFT_HYPHEN = /­/g;

const CVE_PATTERN = /\bCVE[-‐-―−－]\d{4}[-‐-―−－]\d{4,}\b/gi;
const CVSS_PATTERN = /\bCVSS[^.\d]{0,20}?(\d{1,2}\.\d)\b/gi;

/**
 * A deliberately defanged IPv4 address: 192.42.116[.]58, 8.8.8(.)8. The
 * defanging is the signal — it is a convention that means "this is an indicator,
 * do not click it", and nobody defangs a software version.
 */
const DEFANGED_IP_PATTERN =
  /\b(\d{1,3})(?:\[\.\]|\(\.\))(\d{1,3})(?:\[\.\]|\(\.\)|\.)(\d{1,3})(?:\[\.\]|\(\.\)|\.)(\d{1,3})\b|\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\[\.\]|\(\.\))(\d{1,3})\b/g;

/** MD5, SHA-1 and SHA-256 digests. Never prose, never a version. */
const HASH_PATTERN = /\b[a-fA-F0-9]{64}\b|\b[a-fA-F0-9]{40}\b|\b[a-fA-F0-9]{32}\b/g;

/** A plain dotted quad. Ambiguous with a four-part build number — warn only. */
const PLAIN_IP_PATTERN = /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g;

/**
 * Dotted version-like tokens: 7.1.3, 7.1.3-4021, 24.04. Two or more components,
 * so a bare "9.8" is not treated as a version — CVSS scores are handled above.
 */
const VERSION_PATTERN = /\b\d+\.\d+(?:\.\d+)+(?:[-.][A-Za-z0-9]+)*\b/g;

/** A source with its retained page text, from Postgres or from a sidecar file. */
export interface StoredSource {
  url: string;
  publisher: string;
  rawContent: string;
}

/**
 * The check itself, with no database and no Nest container.
 *
 * Split out so the same code can run in two places: the API, where sources come
 * from Postgres, and `npm run audit`, where they come from the sidecar files a
 * research session wrote to disk. An article is normally audited before it is
 * imported, so the audit path has no rows to read — and a second implementation
 * of this logic would drift from the one that actually gates the save.
 */
export function checkGrounding(
  briefId: string,
  sources: StoredSource[],
  frontmatter: Partial<ArticleFrontmatter>,
  body: string,
): GroundingReport {
  {
    const report: GroundingReport = {
      briefId,
      sourceCount: sources.length,
      unsourcedCves: [],
      groundedCves: [],
      unsourcedIndicators: [],
      groundedIndicators: [],
      warnings: [],
    };

    // A source row with no retained text cannot verify anything. That is a
    // different condition from a claim being absent from a page that was read,
    // and reporting it as the latter would block an article over a gap in the
    // brief rather than an error in the writing. Briefs imported from the CLI
    // era are exactly this case: the pages were fetched by Claude Code and never
    // stored.
    const withText = sources.filter((s) => s.rawContent.trim().length > 0);

    if (!withText.length) {
      report.warnings.push(
        sources.length
          ? `None of this brief's ${sources.length} source(s) has retained page text, so no claim in this article could be verified. Re-run research on the topic to store it.`
          : `Research brief ${briefId} has no sources, so no claim in this article could be verified against a fetched page.`,
      );
      return report;
    }

    if (withText.length < sources.length) {
      report.warnings.push(
        `${sources.length - withText.length} of ${sources.length} source(s) have no retained text and were not searched.`,
      );
    }

    const haystacks = withText.map((s) => ({
      label: s.publisher || s.url,
      text: normalize(s.rawContent),
    }));

    const prose = toProse(body);
    const searchable = `${prose}\n${frontmatter.title ?? ''}\n${frontmatter.description ?? ''}`;

    // --- CVE identifiers: the hard gate ---
    // Folded to one spelling before deduplication, or the same identifier
    // written two ways counts twice and is reported twice.
    const claimed = new Set<string>(
      [...(frontmatter.cves ?? []), ...matchAll(searchable, CVE_PATTERN)].map(
        (c) => c.replace(SOFT_HYPHEN, '').replace(DASHES, '-').trim().toUpperCase(),
      ),
    );

    for (const cve of claimed) {
      const needle = normalize(cve);
      const found = haystacks.filter((h) => h.text.includes(needle));
      if (found.length) {
        report.groundedCves.push({ cve, sources: found.map((f) => f.label) });
      } else {
        report.unsourcedCves.push(cve);
      }
    }

    // --- Indicators of compromise: the second hard gate ---
    //
    // The article and its sources need not agree on presentation: a write-up
    // routinely defangs an address the vendor advisory printed plain. Both sides
    // are refanged before comparison so the check is about the value, not the
    // typography. The reported string keeps the article's own spelling, so the
    // operator can find it.
    const indicators = new Set<string>([
      ...matchAll(body, DEFANGED_IP_PATTERN),
      ...matchAll(body, HASH_PATTERN).map((h) => h.toLowerCase()),
    ]);

    for (const indicator of indicators) {
      const needle = normalize(indicator);
      const found = haystacks.filter((h) => h.text.includes(needle));
      if (found.length) {
        report.groundedIndicators.push({
          indicator,
          sources: found.map((f) => f.label),
        });
      } else {
        report.unsourcedIndicators.push(indicator);
      }
    }

    // --- Plain dotted quads: warn only, because versions look identical ---
    for (const quad of new Set(matchAll(prose, PLAIN_IP_PATTERN))) {
      if (!isPlausibleIpv4(quad)) continue;
      // Already reported above in its defanged spelling.
      if (indicators.has(quad)) continue;
      const present = haystacks.some((h) => h.text.includes(quad));
      if (!present) {
        report.warnings.push(
          `"${quad}" reads as an IP address but appears in no fetched source. If it is an indicator of compromise, do not publish it unverified; if it is a version number, ignore this.`,
        );
      }
    }

    // --- CVSS scores: warn only ---
    for (const score of new Set(matchAll(searchable, CVSS_PATTERN, 1))) {
      const present = haystacks.some((h) => h.text.includes(score));
      if (!present) {
        report.warnings.push(
          `CVSS score ${score} does not appear in any fetched source. Confirm it against the vendor advisory before publishing.`,
        );
      }
    }

    // --- Version strings: warn only ---
    const versions = new Set(matchAll(prose, VERSION_PATTERN));
    for (const version of versions) {
      // A version that is part of a CVE identifier is already covered above.
      if (/^\d{4}-\d{4,}$/.test(version)) continue;
      const present = haystacks.some((h) => h.text.includes(version.toLowerCase()));
      if (!present) {
        report.warnings.push(
          `Version string "${version}" does not appear verbatim in any fetched source. It may be a formatting difference, or it may be invented — check it.`,
        );
      }
    }

    return report;
  }
}

@Injectable()
export class GroundingService {
  private readonly logger = new Logger(GroundingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(
    briefId: string,
    frontmatter: Partial<ArticleFrontmatter>,
    body: string,
  ): Promise<GroundingReport> {
    const sources = await this.prisma.researchSource.findMany({
      where: { briefId },
      select: { url: true, publisher: true, rawContent: true },
    });

    const report = checkGrounding(briefId, sources, frontmatter, body);

    if (report.unsourcedCves.length || report.unsourcedIndicators.length) {
      this.logger.warn(
        `Grounding failure on brief ${briefId}: ` +
          [...report.unsourcedCves, ...report.unsourcedIndicators].join(', ') +
          ' absent from all stored source text',
      );
    }

    return report;
  }

  /**
   * Full-text search across a brief's stored sources, so a claim can be checked
   * mid-draft rather than at save time. `npm run audit` does the same search
   * against the sidecar files when the brief is not yet imported.
   */
  async findClaim(
    briefId: string,
    claim: string,
  ): Promise<{ url: string; publisher: string; excerpt: string }[]> {
    const sources = await this.prisma.researchSource.findMany({
      where: { briefId },
      select: { url: true, publisher: true, rawContent: true },
    });

    const needle = normalize(claim);
    const hits: { url: string; publisher: string; excerpt: string }[] = [];

    for (const source of sources) {
      const text = normalize(source.rawContent);
      const at = text.indexOf(needle);
      if (at === -1) continue;
      hits.push({
        url: source.url,
        publisher: source.publisher,
        excerpt: source.rawContent
          .slice(Math.max(0, at - 160), at + needle.length + 160)
          .trim(),
      });
    }

    return hits;
  }
}

/**
 * Lowercase and collapse whitespace so line wrapping cannot hide a match.
 * Defanged separators are restored too, so a source that prints an address
 * plainly still matches an article that defanged it.
 */
function normalize(text: string): string {
  return refang(text)
    .replace(SOFT_HYPHEN, '')
    .replace(DASHES, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Whether a body of text mentions a claim, ignoring case, wrapping, defanging
 * and hyphen spelling. Exported because research.stage.ts asks the same question
 * of a page it has just fetched, and a second implementation would drift from
 * the one that actually gates the save.
 */
export function mentions(haystack: string, needle: string): boolean {
  return normalize(haystack).includes(normalize(needle));
}

/** `192.42.116[.]58` -> `192.42.116.58`, and the `(.)`/`hxxp` variants. */
function refang(text: string): string {
  return text
    .replace(/\[\.\]|\(\.\)/g, '.')
    .replace(/\bhxxps?:/gi, (m) => m.replace(/xx/i, 'tt'));
}

/**
 * Every octet in range. Rules out `2026.3.1.10` outright; a build number like
 * `7.2.63.2` still passes, which is exactly why plain quads only ever warn.
 */
function isPlausibleIpv4(quad: string): boolean {
  const parts = quad.split('.');
  return (
    parts.length === 4 &&
    parts.every((p) => p.length <= 3 && Number(p) >= 0 && Number(p) <= 255)
  );
}

function matchAll(text: string, pattern: RegExp, group = 0): string[] {
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[group]) out.push(m[group]);
  }
  return out;
}
