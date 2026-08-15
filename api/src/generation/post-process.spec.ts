import {
  finaliseBody,
  promoteHeadings,
  deriveSecondaryKeywords,
  sanitiseSlug,
  clampDescription,
  stripEmDashes,
} from './post-process';
import type { Source } from '../seo/article.types';

/**
 * These repairs exist because the model got the same things wrong on every run,
 * and each case below is one that actually shipped a bad article before it was
 * caught. They also have to be idempotent: they run at the end of the draft
 * stage, again after the humanize rewrite, and again after every audit fix.
 */

const source = (publisher: string, url: string, title = ''): Source =>
  ({ publisher, url, title, tier: 1, accessedAt: '2026-08-15' }) as Source;

describe('promoteHeadings', () => {
  it('promotes H3 sections sitting under a single H2', () => {
    const body = [
      '## CISA adds LoadMaster to KEV',
      '',
      '### Why this matters',
      'text',
      '### How does it work?',
      'text',
      '### What to do now',
      'text',
    ].join('\n');

    const out = promoteHeadings(body);
    expect(out).toContain('## How does it work?');
    expect(out).not.toContain('### How does it work?');
  });

  it('leaves a body that already uses several H2s alone', () => {
    const body = ['## One', 'a', '## Two', 'b', '### Sub', 'c'].join('\n');
    expect(promoteHeadings(body)).toBe(body);
  });

  it('does not touch headings inside a fenced block', () => {
    const body = [
      '## Title',
      '### A',
      'x',
      '### B',
      'y',
      '### C',
      '```',
      '### not a heading',
      '```',
    ].join('\n');
    expect(promoteHeadings(body)).toContain('### not a heading');
  });

  it('is idempotent', () => {
    const body = ['## T', '### A', 'x', '### B', 'y', '### C', 'z'].join('\n');
    const once = promoteHeadings(body);
    expect(promoteHeadings(once)).toBe(once);
  });
});

describe('sanitiseSlug', () => {
  it('strips a CVE identifier and its year', () => {
    expect(sanitiseSlug('loadmaster-patch-deadline-cve-2026-8037', 'progress loadmaster')).toBe(
      'loadmaster-patch-deadline',
    );
  });

  it('drops stopwords and caps at six words', () => {
    expect(sanitiseSlug('the-one-two-three-four-five-six-seven', 'x y')).toBe(
      'one-two-three-four-five-six',
    );
  });

  it('falls back to the keyword when filtering empties it', () => {
    expect(sanitiseSlug('cve-2026-8037', 'progress loadmaster')).toBe('progress-loadmaster');
  });
});

describe('clampDescription', () => {
  it('leaves a description inside the range alone', () => {
    const text = 'a'.repeat(155);
    expect(clampDescription(text)).toBe(text);
  });

  it('never ends on a dangling conjunction', () => {
    // The exact shape that shipped: cut landed after "and".
    const text =
      'Progress LoadMaster CVE-2026-8037 is a critical command injection flaw now exploited in the wild. Learn affected versions, patch availability, and immediate action to take today.';
    const out = clampDescription(text);
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out).not.toMatch(/\b(and|or|but|with|for|to|of|the)\.?$/i);
  });

  it('prefers a sentence boundary that lands inside the range', () => {
    // First sentence ends inside 150–160, so it wins over a mid-clause cut.
    const text =
      'Progress LoadMaster carries a critical command injection flaw that is being exploited in the wild, and CISA has now set a federal remediation deadline. Affected versions, the patched releases, and what to check today.';
    const out = clampDescription(text);
    expect(out.endsWith('deadline.')).toBe(true);
    expect(out.length).toBeGreaterThanOrEqual(150);
  });

  it('ignores a sentence boundary that would leave it far too short', () => {
    // First sentence ends at 43 — truncating there would fail the row anyway.
    const text =
      'Progress LoadMaster is under attack today. The rest of this description runs on well past the hard ceiling of one hundred and sixty characters in total length.';
    expect(clampDescription(text).length).toBeGreaterThan(100);
  });
});

describe('deriveSecondaryKeywords', () => {
  const body =
    '## Overview\nProgress LoadMaster has a command injection flaw, CVE-2026-8037, exploited in the wild.';

  it('drops declared keywords the prose never uses', () => {
    const out = deriveSecondaryKeywords(
      body,
      ['LoadMaster patch', 'CISA KEV', 'command injection'],
      'progress loadmaster',
    );
    expect(out).toContain('command injection');
    expect(out).not.toContain('LoadMaster patch');
  });

  it('tops up from what the body actually contains', () => {
    const out = deriveSecondaryKeywords(body, ['nothing here'], 'progress loadmaster');
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out).toContain('CVE-2026-8037');
  });

  it('never returns the primary keyword', () => {
    const out = deriveSecondaryKeywords(body, ['progress loadmaster'], 'progress loadmaster');
    expect(out.map((k) => k.toLowerCase())).not.toContain('progress loadmaster');
  });
});

describe('finaliseBody', () => {
  const sources = [
    source('CISA', 'https://cisa.gov/alert'),
    source('watchTowr', 'https://labs.watchtowr.com/x'),
    source('NVD', 'https://nvd.nist.gov/vuln/detail/CVE-2026-8037', 'CVE-2026-8037 Detail'),
  ];

  const body = [
    '## LoadMaster under attack',
    '',
    'CISA added the flaw after watchTowr published an analysis.',
    '',
    '### How does it work?',
    '',
    'The LoadMaster API is reachable without credentials.',
    '',
    '### What to do',
    '',
    'Patch LoadMaster now.',
    '',
    '### Unknowns',
    '',
    'LoadMaster exposure counts vary.',
  ].join('\n');

  it('expands the keyword, links sources and promotes headings in one pass', () => {
    const out = finaliseBody(body, {
      primaryKeyword: 'progress loadmaster',
      sources,
    });

    expect(out).toMatch(/Progress LoadMaster/);
    expect(out).toContain('](https://cisa.gov/alert)');
    expect(out).toContain('## How does it work?');
  });

  it('is idempotent — a second pass changes nothing', () => {
    const once = finaliseBody(body, { primaryKeyword: 'progress loadmaster', sources });
    const twice = finaliseBody(once, { primaryKeyword: 'progress loadmaster', sources });
    expect(twice).toBe(once);
  });

  it('does not nest a link inside an existing one', () => {
    const linked = '## X\n\n[CISA](https://cisa.gov/alert) added the flaw.';
    const out = finaliseBody(linked, { primaryKeyword: 'progress loadmaster', sources });
    expect(out).not.toMatch(/\[\[/);
    expect((out.match(/https:\/\/cisa\.gov\/alert/g) ?? []).length).toBe(1);
  });
});

describe('ensureKeyword heading insertion', () => {
  const sources: Source[] = [];

  it('introduces the keyword when no heading mentions the product', () => {
    const body = [
      '## What happened: a two-month gap',
      'text',
      '## What to do now',
      'text',
      '## What is still unknown',
      'text',
    ].join('\n');

    const out = finaliseBody(body, { primaryKeyword: 'progress loadmaster', sources });
    const headings = out.split('\n').filter((l) => l.startsWith('## '));

    expect(headings.some((h) => /progress loadmaster/i.test(h))).toBe(true);
    // Prefers the colon-free heading, so it does not produce a double colon.
    expect(out).not.toMatch(/##[^\n]*:[^\n]*:/);
  });

  it('is still idempotent once it has inserted one', () => {
    const body = ['## What to do now', 'text', '## Unknowns', 'text'].join('\n');
    const once = finaliseBody(body, { primaryKeyword: 'progress loadmaster', sources });
    const twice = finaliseBody(once, { primaryKeyword: 'progress loadmaster', sources });
    expect(twice).toBe(once);
  });
});

// Row 11 is required and blocks publication, but the anchoring pass only fires
// when the prose happens to name the publisher. A measured run declared seven
// sources, named two of them, linked two, and failed the run.
describe('external link floor', () => {
  const src = (publisher: string, url: string, title: string): Source =>
    ({ publisher, url, title, tier: 1, accessedAt: '2026-08-15' }) as Source;

  const body = [
    '## What happened',
    '',
    'CVE-2026-20349 is exploited. Cisco published an advisory for CVE-2026-20349.',
    'Defenders tracking CVE-2026-20349 should patch. CVE-2026-20349 has no workaround.',
    '',
    '## What to do now',
    '',
    'Apply the hotfix today.',
  ].join('\n');

  const sources = [
    src('NVD', 'https://nvd.nist.gov/vuln/detail/CVE-2026-20349', 'CVE-2026-20349 Detail'),
    src('The Hacker News', 'https://thehackernews.com/x.html', 'Cisco flaw exploited'),
    src('SOC Prime', 'https://socprime.com/blog/x', 'CVE-2026-20349 analysis'),
  ];

  const external = (b: string) => [...b.matchAll(/\]\((https?:[^)]+)\)/g)].map((m) => m[1]);

  it('reaches the three-link floor when the prose never names the publishers', () => {
    const out = finaliseBody(body, { primaryKeyword: 'cisco asa', sources });
    expect(external(out).length).toBeGreaterThanOrEqual(3);
  });

  it('links each source at most once and stops at the floor', () => {
    const out = finaliseBody(body, { primaryKeyword: 'cisco asa', sources });
    const urls = external(out);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.length).toBe(3);
  });

  it('is idempotent', () => {
    const once = finaliseBody(body, { primaryKeyword: 'cisco asa', sources });
    const twice = finaliseBody(once, { primaryKeyword: 'cisco asa', sources });
    expect(twice).toBe(once);
  });
});

describe('ensureKeyword expansion safety', () => {
  const sources: Source[] = [];
  const body = [
    '## What happened',
    '',
    'An authentication bypass in the product was exploited. The bypass was patched.',
    '',
    '## Who is affected',
    '',
    'Every server is affected by this bypass. LoadMaster ships it by default.',
  ].join('\n');

  it('expands a vendor prefix onto a distinctive head word', () => {
    const out = finaliseBody(body, { primaryKeyword: 'progress loadmaster', sources });
    expect(out).toContain('Progress LoadMaster ships it by default');
  });

  // Shipped as "An authentication N-able N-central Auth bypass in the product",
  // which is not English. A generic head noun appears in sentences that have
  // nothing to do with the keyword's subject, so it is never safe to expand.
  it('does not expand a generic head noun into surrounding prose', () => {
    const out = finaliseBody(body, {
      primaryKeyword: 'N-able N-central auth bypass',
      sources,
    });
    expect(out).toContain('An authentication bypass in the product');
    expect(out).not.toMatch(/authentication N-able/i);
    expect(out).not.toMatch(/this N-able N-central Auth bypass/i);
  });

  it('still satisfies the required keyword-in-H2 row for a generic head noun', () => {
    const out = finaliseBody(body, {
      primaryKeyword: 'N-able N-central auth bypass',
      sources,
    });
    const headings = out.split('\n').filter((l) => l.startsWith('## '));
    expect(headings.some((h) => /n-able n-central auth bypass/i.test(h))).toBe(true);
  });

  // Row 5 (keyword in an H2) is required and blocks publication. Row 6 (density)
  // is advisory. They used to share an early return, so an article that already
  // used the keyword enough times never got the heading and the run died after
  // three audit passes on a row no prose edit could reach.
  it('still puts the keyword in an H2 when density is already satisfied', () => {
    const dense = [
      '## What happened',
      '',
      'Cisco Secure Firewall devices are exploited. Cisco Secure Firewall ships',
      'the flaw by default, and Cisco Secure Firewall operators must patch.',
      '',
      '## What to do now',
      '',
      'Upgrade every Cisco Secure Firewall appliance. Cisco Secure Firewall',
      'hotfixes are out.',
    ].join('\n');

    const out = finaliseBody(dense, {
      primaryKeyword: 'cisco secure firewall',
      sources,
    });
    const headings = out.split('\n').filter((l) => l.startsWith('## '));
    expect(headings.some((h) => /cisco secure firewall/i.test(h))).toBe(true);
  });

  it('leaves prose alone for a keyphrase longer than three words', () => {
    const out = finaliseBody(body, {
      primaryKeyword: 'Cisco Secure Firewall ASA flaw',
      sources,
    });
    expect(out).toContain('LoadMaster ships it by default');
  });
});

describe('stripEmDashes', () => {
  it('replaces a dash in prose', () => {
    expect(stripEmDashes('Patch now — the deadline has passed.')).toBe(
      'Patch now, the deadline has passed.',
    );
  });

  it('leaves dashes inside inline code and URLs alone', () => {
    const line = 'Run `foo --bar—baz` and see https://x.test/a—b for detail.';
    expect(stripEmDashes(line)).toBe(line);
  });

  it('leaves fenced blocks alone', () => {
    const body = ['```', 'a — b', '```'].join('\n');
    expect(stripEmDashes(body)).toBe(body);
  });

  it('is idempotent', () => {
    const once = stripEmDashes('One — two — three.');
    expect(stripEmDashes(once)).toBe(once);
  });
});
