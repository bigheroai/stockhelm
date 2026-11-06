/**
 * Loads .env.local then .env for CLI scripts.
 *
 * Next.js reads these files automatically; a plain `node scripts/x.ts` does
 * not. Without this, settings in .env.local are invisible to the seed script.
 *
 * Real environment variables win: process.loadEnvFile never overwrites a value
 * that is already set.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';

if (typeof process.loadEnvFile === 'function') {
  for (const file of ['.env.local', '.env']) {
    const full = path.join(process.cwd(), file);
    if (!existsSync(full)) continue;
    try {
      process.loadEnvFile(full);
    } catch {
      // A malformed file should not stop a migration; the connection error
      // will be far more useful than a parse error here.
    }
  }
}
