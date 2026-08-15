#!/usr/bin/env node
/**
 * Generates the bcrypt hash for ADMIN_PASSWORD_HASH.
 *
 *   npm run hash:password -- "your-password"
 *
 * Paste the output into api/.env. The plaintext password is never stored.
 */

import bcrypt from 'bcryptjs';

const password = process.argv[2];

if (!password) {
  console.error('Usage: npm run hash:password -- "your-password"');
  process.exit(1);
}

if (password.length < 12) {
  console.error(
    `Password is ${password.length} characters. Use at least 12 — this is the only credential protecting the editor and your API spend.`,
  );
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);

console.log('\nAdd this to api/.env:\n');
console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
