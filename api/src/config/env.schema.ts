import { z } from 'zod';

/**
 * Boot-time environment validation.
 *
 * budgetwise-api reads raw `process.env` and discovers a missing key on the first
 * request that needs it, which surfaces as a failure in the middle of an
 * operation the user has already waited on. Fail at startup instead, with every
 * problem listed at once.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  /** Comma-separated browser origins allowed by CORS. */
  ORIGIN: z.string().default('http://localhost:4200'),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters — generate one with `openssl rand -hex 32`'),
  ADMIN_PASSWORD_HASH: z
    .string()
    .min(1, 'ADMIN_PASSWORD_HASH is required — generate it with `npm run hash:password -- "your-password"`'),

  /**
   * DeepSeek drives the generation stages. It speaks the OpenAI wire format, so
   * the official `openai` client works against its base URL unchanged.
   */
  DEEPSEEK_API_KEY: z.string().min(1),
  DEEPSEEK_BASE_URL: z.string().url().default('https://api.deepseek.com'),
  DEEPSEEK_MODEL: z.string().default('deepseek-chat'),

  /** Web search for the research stage. */
  TAVILY_API_KEY: z.string().min(1),

  CONTENT_DIR: z.string().default('../content'),
  /**
   * Where the editorial documents are read from at boot. They are the source of
   * truth for both the generation prompts and the Claude Code skills, so they are
   * read in place rather than copied into the build.
   */
  DOCS_DIR: z.string().default('../docs'),
  SITE_ORIGIN: z.string().url().default('http://localhost:4200'),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .optional(),
  SENTRY_DSN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * ConfigModule `validate` hook. Throwing here aborts the bootstrap with every
 * problem listed at once rather than one per restart.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment configuration:\n${problems}\n\nCopy api/.env.example to api/.env and fill in the blanks.`,
    );
  }

  return result.data;
}
