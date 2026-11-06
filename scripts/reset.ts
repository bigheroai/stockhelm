import './load-env.mjs';

import { rm } from 'node:fs/promises';
import path from 'node:path';

const url = process.env.DATABASE_URL?.trim();

if (url) {
  console.error(
    'Refusing to reset a remote database.\n' +
      'Drop and recreate the database with your provider, or unset DATABASE_URL to reset the local PGlite file.',
  );
  process.exit(1);
}

const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), '.data', 'pg');
await rm(dir, { recursive: true, force: true });
console.log(`✓ removed ${dir}`);
console.log('Run `pnpm db:migrate && pnpm db:seed` to rebuild.');
