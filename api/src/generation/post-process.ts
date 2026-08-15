import type { Source } from '../seo/article.types';

/**
 * Deterministic repairs applied to a body after every model touch.
 *
 * These were originally done once, at the end of the draft stage, and it did not
 * hold: the humanize pass is a prose editor and treats markdown links as
 * clutter, so a measured run went from two source links to zero and lost the
 * keyword expansions with them. Each audit fix pass rewrites the body again.
 *
 * Anything a model can undo has to be reapplied after the last model touch, so
 * these run at the end of draft, of humanize, and of every audit pass. All of
 * them are idempotent — running twice changes nothing the second time.
 */
export function finaliseBody(
  body: string,
  options: { primaryKeyword: string; sources: Source[] },
): string {
  const levelled = promoteHeadings(stripEmDashes(body));
  const keyworded = ensureKeyword(levelled, options.primaryKeyword);
  return linkPrimarySources(
    keyworded,
    options.sources.map((s) => ({
      url: s.url,
      publisher: s.publisher,
      title: s.title,
    })),
  );
}

/**
 * Remove em and en dashes, per docs/humanize-calibration.md.
 *
 * The humanize pass does this well and gets to zero. The audit fix pass then
 * rewrites the body and puts some back, which is how two survived into a
 * finished article. Doing it here means the policy holds whichever stage wrote
 * last.
 *
 * This is the blunt fallback, not the good version: it always substitutes a
 * comma. The calibration asks for the break to be judged — a full stop where
 * the following clause stands alone — and that judgement belongs to the
 * humanize pass, which does it well. By the time control reaches here the
 * dashes are strays a later rewrite reintroduced, and a comma is right often
 * enough for two or three of them.
 *
 * Code spans and URLs are left alone: a dash inside a command or an identifier
 * is data, not punctuation.
 */
export function stripEmDashes(body: string): string {
  const lines = body.split('\n');
  let inFence = false;

  return lines
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence || !/[—–]/.test(line)) return line;

      const guarded = protectedRanges(line);

      let out = '';
      let cursor = 0;

      for (let i = 0; i < line.length; i++) {
        if (!/[—–]/.test(line[i])) continue;
        if (guarded.some((r) => i >= r.start && i < r.end)) continue;

        out += line.slice(cursor, i).replace(/\s+$/, '');

        const after = line.slice(i + 1).replace(/^\s+/, '');
        out += ', ';
        cursor = i + 1 + (line.slice(i + 1).length - after.length);
      }

      out += line.slice(cursor);
      return out.replace(/,\s*,/g, ',').replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ');
    })
    .join('\n');
}

/**
 * Promote a body that used one H2 as a title and H3 for every section.
 *
 * The page H1 comes from frontmatter, so sections belong at H2 — but told "the
 * body starts at H2" the model wrote a single H2 headline and dropped
 * everything beneath it to H3. That fails two rubric rows at once: row 8 wants a
 * question-form H2, and row 14 wants the featured-snippet paragraph under one.
 * The question heading was present and correct; it was simply one level too
 * deep.
 *
 * Only fires on that exact shape — one H2 with three or more H3s under it —
 * because a body with several H2s is already correct and shifting it would
 * flatten a real hierarchy.
 */
export function promoteHeadings(body: string): string {
  const lines = body.split('\n');
  let inFence = false;
  let h2 = 0;
  let h3 = 0;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^##\s/.test(line)) h2++;
    else if (/^###\s/.test(line)) h3++;
  }

  if (h2 > 1 || h3 < 3) return body;

  inFence = false;
  return lines
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      if (/^####\s/.test(line)) return line.replace(/^####/, '###');
      if (/^###\s/.test(line)) return line.replace(/^###/, '##');
      return line;
    })
    .join('\n');
}

/**
 * Keep only the secondary keywords the body actually contains.
 *
 * Row 7 wants three to five declared, each used at least once. Declaring them
 * before the body is written guarantees the opposite: a measured run declared
 * "CVE-2026-8037 exploitation", "LoadMaster patch" and "CISA KEV", and the prose
 * contained none of the three, because they are phrases nobody writes.
 *
 * So the declaration follows the prose rather than leading it. Candidates that
 * appear survive; the list is topped up from identifiers and phrases detected in
 * the body itself, which are present by construction.
 */
export function deriveSecondaryKeywords(
  body: string,
  declared: string[],
  primaryKeyword: string,
): string[] {
  const haystack = body.toLowerCase();
  const isPresent = (term: string) =>
    term.trim().length > 2 &&
    term.toLowerCase() !== primaryKeyword.toLowerCase() &&
    haystack.includes(term.toLowerCase());

  const kept = declared.filter(isPresent);

  if (kept.length < 3) {
    for (const candidate of detectCandidates(body)) {
      if (kept.length >= 5) break;
      if (!kept.some((k) => k.toLowerCase() === candidate.toLowerCase())) {
        if (isPresent(candidate)) kept.push(candidate);
      }
    }
  }

  return kept.slice(0, 5);
}

/** Phrases that are in the text by construction, in rough order of value. */
function detectCandidates(body: string): string[] {
  const out: string[] = [];

  for (const cve of body.match(/\bCVE-\d{4}-\d{4,}\b/gi) ?? []) {
    if (!out.includes(cve)) out.push(cve);
  }

  for (const phrase of [
    'command injection',
    'remote code execution',
    'authentication bypass',
    'privilege escalation',
    'deserialization',
    'ransomware',
    'CISA KEV',
    'Known Exploited Vulnerabilities',
    'proof-of-concept',
    'exploited in the wild',
    'security advisory',
    'patch',
  ]) {
    if (new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(body)) {
      out.push(phrase);
    }
  }

  return out;
}

export { sanitiseSlug, clampDescription, stripBodyFence, normaliseKeyword };

/**
 * Head words too generic to expand mechanically.
 *
 * These are the nouns a security article uses in ordinary sentences about
 * something other than the keyword's subject, so replacing them with the full
 * keyphrase mangles the prose. See the comment in ensureKeyword.
 */
const GENERIC_HEAD_NOUNS = new Set([
  'bypass', 'flaw', 'patch', 'vulnerability', 'vulnerabilities', 'exploit',
  'attack', 'attacks', 'breach', 'injection', 'zero-day', 'zeroday', 'rce',
  'dos', 'issue', 'bug', 'advisory', 'deadline', 'campaign', 'ransomware',
  'malware', 'backdoor', 'misconfiguration', 'takeover', 'escalation',
  'overflow', 'traversal', 'disclosure', 'leak', 'incident', 'update',
]);

/**
 * Make sure the primary keyword actually appears in the prose.
 *
 * Rows 5 and 6 want the exact phrase in the first 100 words, in an H2, and four
 * to eight times overall. A two-word product keyword like "progress loadmaster"
 * scores zero every time, because a writer names the vendor once and says
 * "LoadMaster" thereafter — which is correct English and exactly what the model
 * produced.
 *
 * So the expansion is done here: take standalone mentions of the distinctive
 * word and restore the full phrase on a few of them. "Progress LoadMaster" in
 * place of "LoadMaster" is always true and always reads naturally, which is why
 * this is safe to do mechanically where stapling a keyword on would not be.
 */
function ensureKeyword(body: string, keyword: string): string {
  const target = 4;
  const words = keyword.split(/\s+/).filter(Boolean);
  if (words.length < 2) return body;

  const head = words[words.length - 1];
  const already = countPhrase(body, keyword);

  // Do NOT return early when density is satisfied. This function serves two
  // independent rubric rows and they fail independently:
  //
  //   row 6, keyword density  — 4 to 8 uses anywhere in the prose
  //   row 5, keyword placement — in the first 100 words AND in an H2 (REQUIRED)
  //
  // `already >= target` used to return here, which meant an article using the
  // keyword five times in body prose and never in a heading was left alone and
  // failed row 5. Row 5 blocks publication, so the run then died after three
  // audit passes on something no prose edit could reach. Measured on
  // "cisco secure firewall": density 4–8 green, every H2 generic, run failed.
  //
  // The heading work below now runs regardless of density; only the body
  // expansion is skipped once there are enough uses.

  // Expanding a standalone head word is only safe when the head names the thing
  // and the leading words name its vendor: "LoadMaster" -> "Progress LoadMaster"
  // is always true and always reads naturally.
  //
  // It is not safe when the keyword ends in a generic noun. With the keyword
  // "N-able N-central auth bypass", expanding every standalone "bypass" produced
  // "An authentication N-able N-central Auth bypass in the product", which is
  // not English. Long keyphrases fail the same way, because the more words in
  // front of the head, the less likely the result is a noun phrase that fits
  // where the head fitted.
  //
  // So mechanical expansion is limited to the cases where it cannot go wrong.
  // Everywhere else the audit loop asks the model to raise density instead,
  // which is the right tool for a judgement about where a phrase belongs.
  const expandable =
    words.length <= 3 && !GENERIC_HEAD_NOUNS.has(head.toLowerCase());

  const lines = body.split('\n');
  let added = already;
  let inFence = false;
  let usedHeading = lines.some(
    (l) => /^\s*##/.test(l) && new RegExp(escapeRegex(keyword), 'i').test(l),
  );

  // Standalone `head` not already preceded by the rest of the phrase, and not
  // already inside a markdown link.
  const standalone = new RegExp(
    `(?<!${escapeRegex(words.slice(0, -1).join(' '))}\\s)(?<!\\[)\\b${escapeRegex(head)}\\b(?!\\])`,
    'i',
  );

  // Headings first — row 5 is required and this is the scarcest slot.
  if (!usedHeading && expandable) {
    for (let i = 0; i < lines.length; i++) {
      if (!/^\s*##/.test(lines[i])) continue;
      const m = standalone.exec(lines[i]);
      if (!m) continue;
      lines[i] =
        lines[i].slice(0, m.index) +
        titleCasePhrase(keyword, m[0]) +
        lines[i].slice(m.index + m[0].length);
      usedHeading = true;
      added++;
      break;
    }
  }

  // Still nothing. Headings like "What to do now" and "What is still unknown"
  // never name the product, so there is no mention to expand — the keyword has
  // to be introduced. Prefixing a colon-free heading is the one transformation
  // that stays grammatical whatever the heading says.
  if (!usedHeading) {
    const label = titleCaseKeyword(keyword);
    let target = lines.findIndex(
      (l) => /^##\s/.test(l) && !l.includes(':') && !/^##\s+Related\s*$/i.test(l),
    );
    if (target === -1) {
      target = lines.findIndex((l) => /^##\s/.test(l) && !/^##\s+Related\s*$/i.test(l));
    }
    if (target !== -1) {
      const text = lines[target].replace(/^##\s+/, '');
      lines[target] = `## ${label}: ${lowerFirst(text)}`;
      usedHeading = true;
      added++;
    }
  }

  for (let i = 0; i < lines.length && added < target && expandable; i++) {
    if (/^\s*```/.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence || /^\s*#/.test(lines[i]) || !lines[i].trim()) continue;

    const m = standalone.exec(lines[i]);
    if (!m) continue;

    lines[i] =
      lines[i].slice(0, m.index) +
      matchCase(keyword, m[0]) +
      lines[i].slice(m.index + m[0].length);
    added++;
  }

  return lines.join('\n');
}

function countPhrase(text: string, phrase: string): number {
  const re = new RegExp(escapeRegex(phrase), 'gi');
  return (text.match(re) ?? []).length;
}

/** "LoadMaster" -> "Progress LoadMaster", preserving the observed casing. */
function matchCase(keyword: string, observed: string): string {
  const parts = keyword.split(/\s+/);
  const prefix = parts
    .slice(0, -1)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return `${prefix} ${observed}`;
}

function titleCasePhrase(keyword: string, observed: string): string {
  return matchCase(keyword, observed);
}

/** "progress loadmaster" -> "Progress LoadMaster"-ish, for use in a heading. */
function titleCaseKeyword(keyword: string): string {
  return keyword
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** "What to do now" -> "what to do now", so it reads after a colon. */
function lowerFirst(text: string): string {
  // Leave an acronym or a product name capitalised — lowering "CISA" would be
  // wrong, and lowering "LoadMaster" would be worse.
  if (/^[A-Z]{2,}\b/.test(text) || /^[A-Z][a-z]+[A-Z]/.test(text)) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** Row 4 rejects these outright. */
const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'for',
  'in',
  'on',
  'to',
  'and',
  'is',
  'are',
]);

/**
 * Force the slug into the rubric's shape.
 *
 * Row 4 wants three to six lowercase hyphenated words, no stopwords, and no
 * four-digit number — that last one exists because a CVE identifier in a URL
 * dates the article the moment the year rolls over. The model was told all of
 * this and still returned `loadmaster-patch-deadline-cve-2026-8037`.
 */
function sanitiseSlug(raw: string, keyword: string): string {
  const words = raw
    .toLowerCase()
    .replace(/\bcve[-\s]?\d{4}[-\s]?\d{4,}\b/gi, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .split('-')
    .filter((w) => w && !STOPWORDS.has(w) && !/^\d{4,}$/.test(w));

  const trimmed = words.slice(0, 6);

  // A slug can be emptied by the filtering above — fall back to the keyword,
  // which is already normalised and is what the URL should carry anyway.
  if (trimmed.length < 3) {
    return keyword
      .replace(/[^a-z0-9]+/g, '-')
      .split('-')
      .filter((w) => w && !STOPWORDS.has(w))
      .slice(0, 6)
      .join('-');
  }

  return trimmed.join('-');
}

/**
 * Bring the meta description inside 150–160 characters.
 *
 * Cuts at a word boundary rather than mid-word, and only ever shortens — padding
 * a short description with filler would satisfy the row and read worse, which is
 * the trade the rubric exists to prevent. A description under 150 is left for
 * the audit pass to rewrite properly.
 */
function clampDescription(raw: string): string {
  const text = raw.trim();
  if (text.length <= 160) return text;

  const cut = text.slice(0, 160);

  // Prefer a sentence end. Cutting mid-clause produced "…patch availability, and
  // immediate." in a live run — inside the character range and unreadable, which
  // is worse than being three characters over.
  const sentenceEnd = Math.max(
    cut.lastIndexOf('. '),
    cut.lastIndexOf('! '),
    cut.lastIndexOf('? '),
  );
  if (sentenceEnd > 140) return cut.slice(0, sentenceEnd + 1);

  let trimmed = cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:—-]+$/, '');

  // Drop a trailing word that cannot end a sentence, repeatedly — "and", then
  // the comma before it, and so on.
  const DANGLING =
    /\s+(and|or|but|with|for|to|of|in|on|the|a|an|plus|including|its|their)$/i;
  while (DANGLING.test(trimmed)) {
    trimmed = trimmed.replace(DANGLING, '').replace(/[\s,;:—-]+$/, '');
  }

  return trimmed.endsWith('.') ? trimmed : `${trimmed}.`;
}

/**
 * Link the first mention of each source, in code.
 *
 * Row 11 is required and the model returned zero links across two separate
 * prompts that asked for them explicitly. Publisher names and CVE identifiers
 * are unambiguous strings that already appear in the prose, so the link can be
 * placed deterministically instead of requested.
 *
 * Only the first mention of each is linked, and never inside an existing link,
 * a heading, or a fenced block.
 */
function linkPrimarySources(
  body: string,
  sources: { url: string; publisher: string; title: string }[],
): string {
  let out = body;

  // Seed with what is already linked. finaliseBody runs after the draft, after
  // the humanize rewrite and after every audit fix pass, so without this a
  // source linked on one pass gets a second link on the next: the earlier
  // occurrences are inside markdown links and skipped, and the matcher simply
  // walks on to the next free occurrence of the same CVE. Three passes turned
  // three links into six, and the internal-link row has a ceiling of four.
  const linked = new Set<string>(
    sources.map((s) => s.url).filter((url) => out.includes(`](${url})`)),
  );

  const targets: { needle: string; url: string }[] = [];
  for (const source of sources) {
    // The CVE identifier is the most natural anchor when the source is an
    // advisory or a CVE record.
    const cve = /\bCVE-\d{4}-\d{4,}\b/i.exec(source.title)?.[0];
    if (cve) targets.push({ needle: cve, url: source.url });

    // Full publisher names rarely appear in prose — a page titled
    // "Cybersecurity and Infrastructure Security Agency CISA" is written as
    // "CISA" in every sentence that mentions it. Try the short forms too, in
    // decreasing specificity, so the anchor lands on the words actually there.
    for (const alias of publisherAliases(source.publisher)) {
      targets.push({ needle: alias, url: source.url });
    }
  }

  for (const { needle, url } of targets) {
    if (linked.has(url)) continue;

    const pattern = new RegExp(`\\b${escapeRegex(needle)}\\b`, 'gi');

    const lines = out.split('\n');
    let inFence = false;
    let done = false;

    for (let i = 0; i < lines.length && !done; i++) {
      if (/^\s*```/.test(lines[i])) {
        inFence = !inFence;
        continue;
      }
      if (inFence || /^\s*#/.test(lines[i]) || /^\s*>/.test(lines[i])) continue;

      const blocked = protectedRanges(lines[i]);
      pattern.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.exec(lines[i])) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (blocked.some((r) => start < r.end && end > r.start)) continue;

        lines[i] =
          lines[i].slice(0, start) + `[${match[0]}](${url})` + lines[i].slice(end);
        linked.add(url);
        done = true;
        break;
      }
    }

    if (done) out = lines.join('\n');
  }

  // Floor pass. Row 11 requires three external links and blocks publication, but
  // everything above only fires when the prose happens to name the publisher.
  // A measured run declared seven sources and linked two, because the body named
  // NVD and HKCERT and none of the other five — then failed after three audit
  // passes on a row no prose edit could reach.
  //
  // The fallback anchors the remaining sources on further mentions of the CVE.
  // That is not a trick to satisfy a counter: a CVE identifier pointing at an
  // advisory or a vendor analysis of that CVE is the correct link to write. It
  // only ever consumes occurrences that are not already linked, and it stops at
  // the floor rather than linking everything.
  if (countExternalLinks(out) < EXTERNAL_LINK_FLOOR) {
    const cve = /\bCVE-\d{4}-\d{4,}\b/i.exec(out)?.[0];
    if (cve) {
      for (const source of sources) {
        if (countExternalLinks(out) >= EXTERNAL_LINK_FLOOR) break;
        if (linked.has(source.url)) continue;

        const next = anchorOnce(out, cve, source.url);
        if (next) {
          out = next;
          linked.add(source.url);
        }
      }
    }
  }

  return out;
}

const EXTERNAL_LINK_FLOOR = 3;

function countExternalLinks(body: string): number {
  const re = /(?<!!)\[[^\]]*\]\((https?:\/\/[^)\s]+)/g;
  return (body.match(re) ?? []).length;
}

/**
 * Wraps the first unlinked occurrence of `needle` in a link to `url`.
 * Returns null when there is no free occurrence left to use.
 */
function anchorOnce(body: string, needle: string, url: string): string | null {
  const lines = body.split('\n');
  const pattern = new RegExp(`\\b${escapeRegex(needle)}\\b`, 'gi');
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence || /^\s*#/.test(lines[i]) || /^\s*>/.test(lines[i])) continue;

    const blocked = protectedRanges(lines[i]);
    pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(lines[i])) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (blocked.some((r) => start < r.end && end > r.start)) continue;

      lines[i] =
        lines[i].slice(0, start) + `[${match[0]}](${url})` + lines[i].slice(end);
      return lines.join('\n');
    }
  }

  return null;
}

/**
 * Character ranges a link must never be inserted into: existing markdown links,
 * bare URLs, and inline code.
 *
 * Without this the matcher happily anchored on the host inside a URL it had
 * already written, producing `[CISA](https://[cisa](https://cisa.gov/…).gov/…)`.
 * The rubric counted the result as a link and passed the article, so the damage
 * was invisible to every check downstream — a lookbehind on `[` is not enough,
 * because the offending match sits in the middle of the URL rather than at its
 * start.
 */
function protectedRanges(line: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];

  for (const re of [
    /\[[^\]]*\]\([^)]*\)/g, // a whole markdown link, label and target
    /https?:\/\/\S+/g, // a bare URL
    /`[^`]*`/g, // inline code
  ]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      ranges.push({ start: m.index, end: m.index + m[0].length });
    }
  }

  return ranges;
}

/**
 * Ways a publisher is actually referred to mid-sentence, most specific first.
 *
 * The trailing acronym is tried before the full name because that is what prose
 * uses on second mention, and second mention is usually the only mention.
 */
function publisherAliases(publisher: string): string[] {
  const name = publisher.trim();
  if (!name || name.length < 3) return [];

  const aliases: string[] = [];

  // "…Security Agency CISA" -> "CISA"
  const trailingAcronym = /\b([A-Z]{2,6})$/.exec(name)?.[1];
  if (trailingAcronym) aliases.push(trailingAcronym);

  aliases.push(name);

  // "The Hacker News" -> "Hacker News"; "Nist" -> skip, already covered.
  const withoutArticle = name.replace(/^(the)\s+/i, '');
  if (withoutArticle !== name) aliases.push(withoutArticle);

  // A distinctive single token, when there is one — "watchTowr", "BleepingComputer".
  const tokens = name.split(/\s+/);
  if (tokens.length === 1 && tokens[0].length > 4) aliases.push(tokens[0]);

  return [...new Set(aliases)].filter((a) => a.length >= 3);
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Models fence whole markdown documents often enough to be worth handling. */
function stripBodyFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return fenced ? fenced[1] : trimmed;
}

/** Lowercase, collapse whitespace, strip a trailing CVE id that reads badly. */
function normaliseKeyword(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\bcve-\d{4}-\d{4,}\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
