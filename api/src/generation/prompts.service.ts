import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { Env } from '../config/env.schema';

/**
 * The editorial documents, read from disk at boot.
 *
 * `docs/` is the single source of truth for both this pipeline and the Claude
 * Code skills. It is read in place rather than copied into the build, because the
 * previous arrangement — a `sync-prompts.mjs` step copying `docs/` into
 * `src/agent/prompts/` on every build — meant a rule could be edited and silently
 * not take effect until someone rebuilt.
 *
 * Missing files throw at startup. A pipeline that generates articles against
 * half its editorial standards is worse than one that refuses to boot.
 */

const REQUIRED = [
  'editorial-standards',
  'seo-checklist',
  'frontmatter-schema',
  'sources',
  'humanize-calibration',
] as const;

type DocName = (typeof REQUIRED)[number];

@Injectable()
export class PromptsService implements OnModuleInit {
  private readonly logger = new Logger(PromptsService.name);
  private readonly docsDir: string;
  private readonly skillsDir: string;
  private readonly docs = new Map<string, string>();

  constructor(config: ConfigService<Env, true>) {
    this.docsDir = path.resolve(
      process.cwd(),
      config.get('DOCS_DIR', { infer: true }),
    );
    // The humanizer skill is vendored beside the other skills, not in docs/,
    // because it is upstream code under its own licence.
    this.skillsDir = path.resolve(this.docsDir, '..', '.claude', 'skills');
  }

  onModuleInit() {
    const missing: string[] = [];

    for (const name of REQUIRED) {
      const file = path.join(this.docsDir, `${name}.md`);
      if (!existsSync(file)) {
        missing.push(path.relative(process.cwd(), file));
        continue;
      }
      this.docs.set(name, readFileSync(file, 'utf8'));
    }

    const humanizer = path.join(this.skillsDir, 'humanizer', 'SKILL.md');
    if (!existsSync(humanizer)) {
      missing.push(path.relative(process.cwd(), humanizer));
    } else {
      this.docs.set('humanizer', stripFrontmatter(readFileSync(humanizer, 'utf8')));
    }

    if (missing.length) {
      throw new Error(
        `Editorial documents are missing:\n${missing.map((m) => `  - ${m}`).join('\n')}\n\n` +
          'Set DOCS_DIR if they live somewhere other than ../docs.',
      );
    }

    this.logger.log(
      `Loaded ${this.docs.size} editorial document(s) from ${path.relative(process.cwd(), this.docsDir)}`,
    );
  }

  doc(name: DocName | 'humanizer'): string {
    const found = this.docs.get(name);
    if (!found) throw new Error(`Editorial document "${name}" was not loaded.`);
    return found;
  }

  /** Shared preamble. Every stage gets the role and the accuracy rules. */
  preamble(): string {
    return [
      'You are a security journalist writing for a technically literate audience:',
      'sysadmins, SOC analysts, incident responders, IT leads. They already know',
      'what ransomware is. They want to know which CVE, which versions, whether it',
      'is exploited in the wild, and what to do before Monday.',
      '',
      `Today is ${today()}.`,
      '',
      'These rules are absolute:',
      '',
      '1. Never invent a fact. No fabricated CVE IDs, CVSS scores, version numbers,',
      '   dates, company names, victim counts or quotes. If it is not in the source',
      '   material you were given, it does not go in the output.',
      '2. Signal confidence with the verb. "Confirmed" = vendor advisory, CISA, or',
      '   the affected organisation. "Reported" = a single credible outlet.',
      '   "Claimed" = a threat actor\'s assertion. Never flatten these into "is".',
      '3. A vendor blog is not neutral reporting. Name the vendor in-text when',
      '   citing its research.',
      '4. Date-stamp anything volatile — patch status, victim counts, attribution.',
      '5. Where sources conflict, report the conflict. Do not pick a side.',
      '6. Surface what is not known, explicitly.',
    ].join('\n');
  }
}

/** Skill files carry Claude Code dispatch metadata that is noise in a prompt. */
function stripFrontmatter(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
