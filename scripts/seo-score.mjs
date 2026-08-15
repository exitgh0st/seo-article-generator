/**
 * Implements the rubric in docs/seo-checklist.md.
 *
 * Returns { score, max, rows: [{ n, name, status, detail, required }] }
 * status is 'pass' | 'fail' | 'warn'. Only 'pass' earns a point.
 *
 * Keep this in sync with docs/seo-checklist.md — that document is what the
 * agent writes against, and this is what the app reports.
 */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'for', 'in', 'on', 'at', 'to', 'and', 'or', 'is',
  'are', 'was', 'were', 'be', 'with', 'by', 'from', 'as', 'it', 'its',
]);

const QUESTION_STARTERS = /^(what|why|how|who|when|where|which|is|are|does|do|can|should|will)\b/i;

/** Strip fenced code, inline code, images, and link syntax down to prose. */
export function toProse(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\|/g, ' ');
}

export function countWords(text) {
  const m = text.match(/\b[\w'-]+\b/g);
  return m ? m.length : 0;
}

/** Occurrences of a multi-word phrase, case- and whitespace-insensitive. */
export function countPhrase(text, phrase) {
  if (!phrase) return 0;
  const escaped = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const matches = text.match(new RegExp(`\\b${escaped}\\b`, 'gi'));
  return matches ? matches.length : 0;
}

export function extractHeadings(markdown) {
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, '');
  const headings = [];
  const re = /^(#{1,6})\s+(.+?)\s*$/gm;
  let m;
  while ((m = re.exec(withoutCode)) !== null) {
    headings.push({ level: m[1].length, text: m[2].trim() });
  }
  return headings;
}

/** Paragraphs = blank-line-separated blocks that aren't headings, lists, tables or code. */
function extractParagraphs(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b && !/^#{1,6}\s/.test(b) && !/^[-*+]\s/.test(b) && !/^\d+\.\s/.test(b) && !/^\|/.test(b) && !/^>/.test(b));
}

function splitSentences(prose) {
  return prose
    .split(/(?<=[.!?])\s+(?=[A-Z"'(])/)
    .map((s) => s.trim())
    .filter((s) => countWords(s) > 0);
}

function countSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const groups = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '')
    .match(/[aeiouy]{1,2}/g);
  return groups ? groups.length : 1;
}

function fleschReadingEase(prose) {
  const sentences = splitSentences(prose);
  const words = prose.match(/\b[\w'-]+\b/g) || [];
  if (!sentences.length || !words.length) return null;
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  return 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syllables / words.length);
}

function extractLinks(markdown) {
  const internal = [];
  const external = [];
  const re = /(?<!!)\[([^\]]*)\]\(([^)\s]+)/g;
  let m;
  while ((m = re.exec(markdown)) !== null) {
    const [, text, href] = m;
    if (/^https?:\/\//i.test(href)) external.push({ text, href });
    else if (href.startsWith('/article/') || href.endsWith('.md')) internal.push({ text, href });
  }
  return { internal, external };
}

/**
 * @param {object} data   parsed frontmatter
 * @param {string} body   markdown body
 * @param {object} ctx    { totalArticles } — used to relax the internal-link row early on
 */
export function scoreArticle(data, body, ctx = {}) {
  const prose = toProse(body);
  const wordCount = countWords(prose);
  const headings = extractHeadings(body);
  const paragraphs = extractParagraphs(body);
  const { internal, external } = extractLinks(body);
  const keyword = (data.primaryKeyword || '').trim();
  const rows = [];

  const row = (n, name, status, detail, required = false) =>
    rows.push({ n, name, status, detail, required });

  // 1. Title tag
  const title = data.title || '';
  const titleWords = title.toLowerCase().split(/\s+/).slice(0, 5).join(' ');
  const kwInTitleHead = keyword ? countPhrase(titleWords, keyword) > 0 : false;
  row(1, 'Title tag',
    title.length > 0 && title.length <= 60 && kwInTitleHead ? 'pass' : 'fail',
    `${title.length} chars, keyword ${kwInTitleHead ? 'in' : 'NOT in'} first 5 words`, true);

  // 2. H1 — the page H1 is rendered from frontmatter (`headline`, falling back to
  // `title`). The body must contain none, or the page ships two H1 elements.
  const h1s = headings.filter((h) => h.level === 1);
  row(2, 'H1', h1s.length === 0 ? 'pass' : 'fail',
    h1s.length === 0 ? 'one, from frontmatter' : `${h1s.length} in body — move to the \`headline\` field`, true);

  // 3. Meta description
  const desc = data.description || '';
  const descOk = desc.length >= 150 && desc.length <= 160 && countPhrase(desc, keyword) > 0;
  row(3, 'Meta description', descOk ? 'pass' : 'fail',
    `${desc.length} chars (150–160), keyword ${countPhrase(desc, keyword) > 0 ? '✓' : '✗'}`, true);

  // 4. Slug
  const slugParts = (data.slug || '').split('-').filter(Boolean);
  const slugStops = slugParts.filter((p) => STOPWORDS.has(p));
  const slugHasDate = /\d{4}/.test(data.slug || '');
  const slugOk = slugParts.length >= 3 && slugParts.length <= 6 && !slugStops.length && !slugHasDate;
  row(4, 'Slug', slugOk ? 'pass' : 'fail',
    `${slugParts.length} words${slugStops.length ? `, stopwords: ${slugStops.join(', ')}` : ''}${slugHasDate ? ', contains a date' : ''}`, true);

  // 5. Keyword placement
  const first100 = prose.split(/\s+/).slice(0, 100).join(' ');
  const kwInIntro = countPhrase(first100, keyword) > 0;
  const kwInH2 = headings.some((h) => h.level === 2 && countPhrase(h.text, keyword) > 0);
  row(5, 'Keyword placement', kwInIntro && kwInH2 ? 'pass' : 'fail',
    `first 100 words ${kwInIntro ? '✓' : '✗'}, H2 ${kwInH2 ? '✓' : '✗'}`, true);

  // 6. Keyword density
  const kwCount = countPhrase(prose, keyword);
  row(6, 'Keyword density', kwCount >= 4 && kwCount <= 8 ? 'pass' : 'warn',
    `${kwCount} uses (target 4–8)`);

  // 7. Secondary keywords
  const secondary = data.secondaryKeywords || [];
  const unused = secondary.filter((k) => countPhrase(prose, k) === 0);
  row(7, 'Secondary keywords',
    secondary.length >= 3 && secondary.length <= 5 && !unused.length ? 'pass' : 'warn',
    `${secondary.length} declared${unused.length ? `, unused: ${unused.join(', ')}` : ', all used'}`);

  // 8. Heading hierarchy
  let skipped = null;
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level > headings[i - 1].level + 1) {
      skipped = `H${headings[i - 1].level} → H${headings[i].level}`;
      break;
    }
  }
  const hasQuestionH2 = headings.some((h) => h.level === 2 && (h.text.includes('?') || QUESTION_STARTERS.test(h.text)));
  row(8, 'Heading hierarchy', !skipped && hasQuestionH2 ? 'pass' : 'warn',
    skipped ? `skipped level: ${skipped}` : hasQuestionH2 ? 'clean, question-form H2 ✓' : 'clean, but no question-form H2');

  // 9. Length
  row(9, 'Length', wordCount >= 900 && wordCount <= 1400 ? 'pass' : 'warn',
    `${wordCount} words (900–1400)`);

  // 10. Internal links — can't link to articles that don't exist yet
  const soleArticle = (ctx.totalArticles ?? 1) <= 1;
  row(10, 'Internal links',
    internal.length >= 2 && internal.length <= 4 ? 'pass' : soleArticle ? 'pass' : 'warn',
    soleArticle && internal.length === 0 ? '0 — no other articles exist yet' : `${internal.length} (target 2–4)`);

  // 11. External links
  row(11, 'External links', external.length >= 3 ? 'pass' : 'fail',
    `${external.length} (minimum 3)`, true);

  // 12. Images
  const hero = data.heroImage;
  row(12, 'Images',
    hero?.src ? (hero.alt ? 'pass' : 'fail') : 'warn',
    hero?.src ? (hero.alt ? 'hero + alt ✓' : 'hero image missing alt text') : 'no hero image declared');

  // 13. Schema — everything NewsArticle JSON-LD needs
  const schemaMissing = ['title', 'description', 'publishedAt', 'updatedAt']
    .filter((f) => !data[f])
    .concat(data.author?.name ? [] : ['author.name']);
  row(13, 'Schema', schemaMissing.length ? 'fail' : 'pass',
    schemaMissing.length ? `missing: ${schemaMissing.join(', ')}` : 'complete', true);

  // 14. Featured snippet — a 40-60 word paragraph directly under a question-form H2
  let snippet = null;
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^##\s+(.+)$/);
    if (!h) continue;
    if (!(h[1].includes('?') || QUESTION_STARTERS.test(h[1]))) continue;
    const next = paragraphs.find((p) => body.indexOf(p) > body.indexOf(lines[i]));
    if (!next) continue;
    const n = countWords(toProse(next));
    if (n >= 40 && n <= 60) { snippet = { heading: h[1], words: n }; break; }
  }
  row(14, 'Featured snippet', snippet ? 'pass' : 'warn',
    snippet ? `${snippet.words} words under "${snippet.heading}"` : 'no 40–60 word answer under a question-form H2');

  // 15. Readability
  // Flesch floor is 40, not the usual 50: CVE identifiers, version strings, and
  // product names are scored as polysyllabic and drag technical security copy
  // into the 40s even when the prose is clean. Calibrated against real output.
  const sentences = splitSentences(prose);
  const avgSentence = sentences.length ? wordCount / sentences.length : 0;
  const flesch = fleschReadingEase(prose);
  row(15, 'Readability',
    avgSentence < 22 && flesch !== null && flesch >= 40 && flesch <= 65 ? 'pass' : 'warn',
    `avg ${avgSentence.toFixed(1)} words/sentence, Flesch ${flesch === null ? 'n/a' : flesch.toFixed(1)}`);

  const score = rows.filter((r) => r.status === 'pass').length;
  const blocking = rows.filter((r) => r.required && r.status === 'fail');

  return {
    score,
    max: rows.length,
    rows,
    blocking: blocking.map((r) => `${r.n}. ${r.name}: ${r.detail}`),
    stats: { wordCount, internalLinks: internal.length, externalLinks: external.length, keywordCount: kwCount },
  };
}
