/**
 * Resets the admin password directly in the database.
 *
 *   npm run password:reset -- "a new password"
 *
 * This is the recovery path for a forgotten password, and it exists because the
 * obvious move no longer works. ADMIN_PASSWORD_HASH only ever seeds the
 * AdminCredential row; once that row exists, editing the environment variable and
 * restarting changes nothing. Without this script a forgotten password would mean
 * hand-writing SQL against production.
 *
 * It bumps passwordChangedAt along with the hash, so every token issued before now
 * stops working — the same invalidation a change through the app performs.
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { BCRYPT_COST } from '../src/auth/auth.service';

async function main() {
  const password = process.argv.slice(2).find((a) => !a.startsWith('--'));

  if (!password) {
    console.error('Usage: npm run password:reset -- "a new password"');
    process.exit(1);
  }

  // Same minimum the change-password endpoint and hash-password.mjs enforce.
  if (password.length < 12) {
    console.error(
      `Password is ${password.length} characters. Use at least 12 — this is the only credential protecting the editor.`,
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const prisma = app.get(PrismaService);

  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    await prisma.adminCredential.upsert({
      where: { id: 1 },
      create: { id: 1, passwordHash },
      update: { passwordHash, passwordChangedAt: new Date() },
    });

    console.log('\n  Admin password reset. Every existing session is signed out.\n');
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error((error as Error).stack ?? String(error));
  process.exit(1);
});
