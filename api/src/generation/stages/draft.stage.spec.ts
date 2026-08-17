import { FrontmatterSchema } from './draft.stage';

/**
 * The schema's job is to prove the reply is usable, not that it is good.
 *
 * It used to do both, and the second half cost a live run: a frontmatter reply
 * was rejected outright for a description under 120 characters and for offering
 * more secondary keywords than asked, both of which the stage repairs a few lines
 * later with `clampDescription` and `deriveSecondaryKeywords`. The run failed
 * three times on the same call and the operator had nothing to go on.
 *
 * So these tests are mostly about what the schema now lets *through*. The rubric
 * still fails a 90-character description — that is its row, and the audit stage
 * exists to fix it.
 */

const valid = {
  title: 'Adobe Commerce account hijack flaw exploited in the wild',
  headline: 'Adobe Commerce account hijack flaw exploited in the wild',
  slug: 'adobe-commerce-account-hijack',
  description:
    'Adobe Commerce stores are under active attack through SessionReaper, ' +
    'CVE-2025-54236. Apply the September 9 hotfix now — 62% have not.',
  secondaryKeywords: ['SessionReaper', 'CVE-2025-54236', 'Magento'],
  category: 'vulnerabilities',
  tags: ['adobe', 'magento', 'exploitation'],
  cves: ['CVE-2025-54236'],
};

const parse = (over: Record<string, unknown>) =>
  FrontmatterSchema.safeParse({ ...valid, ...over });

describe('FrontmatterSchema', () => {
  it('accepts a well-formed reply', () => {
    expect(parse({}).success).toBe(true);
  });

  it('accepts a short description, which clampDescription leaves alone', () => {
    expect(parse({ description: 'A'.repeat(90) }).success).toBe(true);
  });

  it('accepts more secondary keywords than the prompt asked for', () => {
    expect(
      parse({
        secondaryKeywords: ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7'],
      }).success,
    ).toBe(true);
  });

  it('accepts a slug the model wrote badly, for sanitiseSlug to normalise', () => {
    expect(parse({ slug: 'Adobe Commerce CVE-2025-54236!' }).success).toBe(true);
  });

  it('accepts an off-list category, which falls back to the operator’s', () => {
    expect(parse({ category: 'ecommerce-security' }).success).toBe(true);
  });

  it('accepts a title over the 60-character rubric limit', () => {
    expect(parse({ title: 'A'.repeat(80) }).success).toBe(true);
  });

  it('defaults cves when the key is absent', () => {
    const { cves, ...withoutCves } = valid;
    const result = FrontmatterSchema.safeParse(withoutCves);

    expect(result.success).toBe(true);
    expect(result.success && result.data.cves).toEqual([]);
  });

  // Still rejected, because none of these is repairable — an absent title is not
  // a title in the wrong shape, and there is nothing downstream to derive one
  // from. These are the replies worth spending a correction turn on.
  it.each([
    ['a missing title', { title: undefined }],
    ['an empty description', { description: '' }],
    ['no secondary keywords', { secondaryKeywords: [] }],
    ['no tags', { tags: [] }],
    ['a non-string title', { title: 42 }],
  ])('rejects %s', (_label, over) => {
    expect(parse(over).success).toBe(false);
  });

  it('rejects the empty object that ended the Adobe Commerce run', () => {
    expect(FrontmatterSchema.safeParse({}).success).toBe(false);
  });
});
