import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Env } from '../config/env.schema';

export interface SiteConfig {
  name: string;
  tagline: string;
  origin: string;
  description: string;
  language: string;
}

const FALLBACK: SiteConfig = {
  name: 'Cyber Brief',
  tagline: 'Cybersecurity news, sourced and analyzed',
  origin: 'http://localhost:4200',
  description: 'Cybersecurity news and analysis.',
  language: 'en-us',
};

/**
 * Reads the repo's site.config.json rather than restating its contents.
 *
 * That file and app/src/app/core/site.config.ts already duplicate each other and
 * are kept in sync by hand; a third copy here would make it three. SITE_ORIGIN
 * overrides the file's `origin` so a deployment can point at its real domain
 * without editing a checked-in file.
 */
@Injectable()
export class SiteConfigService implements OnModuleInit {
  private readonly logger = new Logger(SiteConfigService.name);
  private config: SiteConfig = FALLBACK;

  constructor(private readonly env: ConfigService<Env, true>) {}

  async onModuleInit() {
    const contentDir = path.resolve(
      process.cwd(),
      this.env.get('CONTENT_DIR', { infer: true }),
    );
    // site.config.json sits beside content/, at the repo root.
    const candidate = path.join(path.dirname(contentDir), 'site.config.json');

    if (existsSync(candidate)) {
      try {
        const parsed = JSON.parse(await readFile(candidate, 'utf8')) as SiteConfig;
        this.config = { ...FALLBACK, ...parsed };
        this.logger.log(`Loaded site config from ${candidate}`);
      } catch (error) {
        this.logger.warn(
          `Could not parse ${candidate}, using defaults: ${(error as Error).message}`,
        );
      }
    } else {
      this.logger.warn(
        `No site.config.json at ${candidate}; feeds will use default metadata.`,
      );
    }

    // The deployed origin is environment, not content.
    this.config.origin = this.env.get('SITE_ORIGIN', { infer: true });
  }

  get(): SiteConfig {
    return this.config;
  }

  /** Absolute URL for a site-relative path. */
  url(pathname: string): string {
    return `${this.config.origin.replace(/\/$/, '')}${pathname}`;
  }
}
