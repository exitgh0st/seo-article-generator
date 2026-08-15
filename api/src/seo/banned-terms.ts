/**
 * The banned openers, vocabulary, and patterns from docs/editorial-standards.md,
 * as deterministic checks.
 *
 * In the CLI workflow this was a self-check the model ran on its own draft (step 2
 * of that document's ten-point list). A model grading its own prose against a list
 * it is also generating from is the weakest link in the pipeline, so it runs as
 * code here instead.
 *
 * docs/editorial-standards.md remains the source of truth for *what* is banned and
 * why. Every rule below traces to a row or paragraph in it; nothing is added that
 * the document does not ban. When that document changes, change this file.
 */

export type EditorialSeverity = 'violation' | 'advisory';

export interface EditorialHit {
  /** Label shown in the audit report. */
  term: string;
  /** 1-indexed against the markdown body. */
  line: number;
  /** The offending line, trimmed. */
  text: string;
  severity: EditorialSeverity;
  /** Why it fired, where the doc qualifies the rule. */
  note?: string;
}

interface BannedRule {
  term: string;
  pattern: RegExp;
  severity?: EditorialSeverity;
  note?: string;
}

/**
 * `leverage` is banned as a verb only. The noun ("the attacker's leverage") is
 * ordinary English and stays — .claude/skills/seo-audit/SKILL.md calls this out as
 * a known false positive of a naive grep. Matching the inflected forms plus bare
 * `leverage` after an infinitive marker or modal gets the verb without the noun.
 */
const LEVERAGE_VERB =
  /\b(?:leverages|leveraged|leveraging)\b|\b(?:to|can|could|will|would|may|might|must|should|helps?|allows?)\s+leverage\b/i;

/**
 * `navigate` and `landscape` are banned in their figurative senses only. A literal
 * "navigate to the admin console" is fine; "navigate the threat landscape" is not.
 * Figurative use is detected by the abstract nouns these verbs get paired with.
 */
const NAVIGATE_FIGURATIVE =
  /\bnavigat(?:e|es|ed|ing)\s+(?:the\s+|this\s+|these\s+|an?\s+)?(?:complex|complexities|challenges?|landscape|world|environment|waters|maze|minefield|realities)\b/i;

const LANDSCAPE_FIGURATIVE =
  /\b(?:threat|security|cyber(?:security)?|digital|risk|evolving|changing|current|modern)\s+landscape\b|\blandscape\s+of\s+(?:threats?|risks?|attacks?|cybersecurity)\b/i;

/** Rows of the banned-vocabulary table, in document order. */
export const BANNED_VOCABULARY: BannedRule[] = [
  { term: 'delve into', pattern: /\bdelv(?:e|es|ed|ing)\s+into\b/i },
  {
    term: 'leverage (verb)',
    pattern: LEVERAGE_VERB,
    note: 'the noun is ordinary English and is allowed',
  },
  { term: 'robust', pattern: /\brobust(?:ness)?\b/i },
  { term: 'seamless / seamlessly', pattern: /\bseamless(?:ly)?\b/i },
  {
    term: 'landscape (figurative)',
    pattern: LANDSCAPE_FIGURATIVE,
    note: 'a literal landscape would be fine',
  },
  { term: 'realm', pattern: /\brealms?\b/i },
  { term: 'tapestry', pattern: /\btapestry\b/i },
  { term: 'testament', pattern: /\btestament\b/i },
  {
    term: 'navigate (figurative)',
    pattern: NAVIGATE_FIGURATIVE,
    note: 'literal navigation is allowed',
  },
  { term: 'unlock', pattern: /\bunlock(?:s|ed|ing)?\b/i },
  { term: 'empower', pattern: /\bempower(?:s|ed|ing|ment)?\b/i },
  { term: 'game-changer', pattern: /\bgame[-\s]chang(?:er|ing)\b/i },
  { term: 'cutting-edge', pattern: /\bcutting[-\s]edge\b/i },
  { term: 'state-of-the-art', pattern: /\bstate[-\s]of[-\s]the[-\s]art\b/i },
  { term: 'ever-evolving', pattern: /\bever[-\s]evolving\b/i },
  { term: 'rapidly evolving', pattern: /\brapidly[-\s]evolving\b/i },
  { term: 'bad actors', pattern: /\bbad\s+actors?\b/i },
  { term: 'threat landscape', pattern: /\bthreat\s+landscape\b/i },
  { term: 'a treasure trove of', pattern: /\ba\s+treasure\s+trove\s+of\b/i },
  { term: 'the aforementioned', pattern: /\bthe\s+aforementioned\b/i },
  // "crucial, vital, critical (as filler)". `critical` is legitimate for a CVSS
  // rating or a CISA severity, so it is reported as an advisory the auditor reads
  // in context rather than a hard violation.
  { term: 'crucial', pattern: /\bcrucial(?:ly)?\b/i },
  { term: 'vital', pattern: /\bvital(?:ly)?\b/i },
  {
    term: 'critical (as filler)',
    pattern: /\bcritical(?:ly)?\b/i,
    severity: 'advisory',
    note: 'legitimate for a CVSS rating or CISA severity — read the line before flagging',
  },
];

/** Banned patterns that are per-line rather than structural. */
export const BANNED_PATTERNS: BannedRule[] = [
  {
    term: 'hedging preamble',
    pattern:
      /\b(?:it'?s\s+(?:important|worth)\s+(?:to\s+note|noting|mentioning)\s+that|^\s*(?:notably|interestingly)\b)/i,
    note: 'delete the preamble and state the thing',
  },
  {
    term: 'summary conclusion',
    pattern: /\b(?:in\s+conclusion|to\s+sum\s+up|to\s+summari[sz]e|in\s+summary)\b/i,
    note: 'end on forward-looking substance instead',
  },
  {
    term: 'empty attribution',
    pattern:
      /\b(?:experts?\s+say|researchers?\s+warn|analysts?\s+say|according\s+to\s+(?:security\s+)?(?:experts?|professionals?|researchers?)\b(?!\s+at\b)|security\s+professionals\s+(?:say|warn))/i,
    note: 'name the person or organization, or cut the claim',
  },
];

/** "in the wild" is fine once. Three uses is the ban. */
const IN_THE_WILD = /\bin\s+the\s+wild\b/gi;
const IN_THE_WILD_LIMIT = 2;

/** Transition words that must not open consecutive paragraphs. */
const TRANSITION_OPENERS =
  /^(?:furthermore|moreover|additionally|in\s+addition)\b/i;

/** The banned openers list, applied to the first paragraph only. */
const BANNED_OPENERS: BannedRule[] = [
  {
    term: 'context-first opener',
    pattern:
      /^(?:in\s+today'?s?\b|in\s+an?\s+era\s+where\b|as\s+technology\s+continues\b|cybersecurity\s+has\s+become\b|with\s+cyber\s?attacks\s+on\s+the\s+rise\b|imagine\s+)/i,
  },
  {
    term: 'rhetorical-question opener',
    pattern: /^[^.!]*\?/,
  },
  {
    term: 'definition opener',
    pattern:
      /^\s*\w[\w\s-]*\s+is\s+an?\s+(?:type\s+of|form\s+of|kind\s+of|class\s+of)\b/i,
  },
];

export interface EditorialScanResult {
  hits: EditorialHit[];
  /** Paragraph starts that open with a transition word right after one that does. */
  transitionChains: { line: number; text: string }[];
  /** Set when the body's first paragraph trips a banned-opener pattern. */
  openerViolation: { term: string; text: string } | null;
  /** True when every check passed with no hard violation. */
  clean: boolean;
}

/**
 * Scans a markdown body. Line numbers are 1-indexed against the body, so a caller
 * reporting positions in a full markdown file must add the frontmatter offset.
 */
export function scanEditorial(body: string): EditorialScanResult {
  // Fenced and inline code are not prose. Blank the fenced lines rather than
  // removing them so line numbers stay accurate.
  const lines = body.split('\n');
  const masked: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      masked.push('');
      continue;
    }
    masked.push(inFence ? '' : line.replace(/`[^`]*`/g, ' '));
  }

  const hits: EditorialHit[] = [];
  const record = (rule: BannedRule, line: number, text: string) =>
    hits.push({
      term: rule.term,
      line,
      text,
      severity: rule.severity ?? 'violation',
      note: rule.note,
    });

  masked.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    for (const rule of [...BANNED_VOCABULARY, ...BANNED_PATTERNS]) {
      if (rule.pattern.test(line)) record(rule, i + 1, trimmed);
    }
  });

  // "in the wild" is a frequency rule, not a presence rule.
  const prose = masked.join('\n');
  const wildCount = (prose.match(IN_THE_WILD) ?? []).length;
  if (wildCount > IN_THE_WILD_LIMIT) {
    const firstExcess = masked.findIndex((l) => /\bin\s+the\s+wild\b/i.test(l));
    hits.push({
      term: 'in the wild (overused)',
      line: firstExcess + 1,
      text: masked[firstExcess]?.trim() ?? '',
      severity: 'violation',
      note: `${wildCount} uses — fine once, not three times`,
    });
  }

  // Paragraph starts: a non-empty prose line preceded by a blank line.
  const paragraphStarts: { line: number; text: string }[] = [];
  masked.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (/^(?:#{1,6}\s|[-*+]\s|\d+\.\s|\||>)/.test(trimmed)) return;
    const previous = i === 0 ? '' : masked[i - 1].trim();
    if (previous === '') paragraphStarts.push({ line: i + 1, text: trimmed });
  });

  const transitionChains: { line: number; text: string }[] = [];
  for (let i = 1; i < paragraphStarts.length; i++) {
    if (
      TRANSITION_OPENERS.test(paragraphStarts[i].text) &&
      TRANSITION_OPENERS.test(paragraphStarts[i - 1].text)
    ) {
      transitionChains.push(paragraphStarts[i]);
    }
  }

  let openerViolation: EditorialScanResult['openerViolation'] = null;
  const lede = paragraphStarts[0]?.text ?? '';
  for (const opener of BANNED_OPENERS) {
    if (opener.pattern.test(lede)) {
      openerViolation = { term: opener.term, text: lede };
      break;
    }
  }

  return {
    hits,
    transitionChains,
    openerViolation,
    clean:
      !hits.some((h) => h.severity === 'violation') &&
      transitionChains.length === 0 &&
      openerViolation === null,
  };
}
