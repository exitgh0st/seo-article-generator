/**
 * Site-wide identity used in metadata and JSON-LD.
 *
 * `name`, `tagline`, `origin`, and `description` are duplicated in
 * /site.config.json, which the build script uses to generate sitemap.xml and
 * rss.xml. Keep the two in sync — `origin` in particular, since canonical URLs
 * and sitemap URLs must agree.
 *
 * Changing `origin` also means updating `security.allowedHosts` in
 * app/angular.json. Angular's SSR engine rejects any Host header not on that
 * list and silently falls back to client-side rendering, which drops every
 * meta tag from the served HTML.
 */
export const SITE = {
  name: 'Cyber Brief',
  tagline: 'Cybersecurity news, sourced and analyzed',
  origin: 'https://example.com',
  description:
    'Cybersecurity news and analysis for sysadmins, SOC analysts, and IT leads. Vulnerabilities, breaches, and threat intelligence, sourced to primary advisories.',
  publisher: 'Cyber Brief',
  twitter: '@cyberbrief',
  locale: 'en_US',
} as const;

export const CATEGORY_LABELS: Record<string, string> = {
  vulnerabilities: 'Vulnerabilities',
  breaches: 'Breaches',
  ransomware: 'Ransomware',
  'threat-intel': 'Threat Intel',
  policy: 'Policy',
  'ai-security': 'AI Security',
};
