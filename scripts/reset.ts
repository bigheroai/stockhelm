import './load-env.mjs';

import { rm } from 'node:fs/promises';
import path from 'node:path';

if (process.env.NETLIFY_DB_URL?.trim()) {
  console.error(
    'Refusing to reset Netlify Database. Unset NETLIFY_DB_URL to reset the local PGlite file.',
  );
  process.exit(1);
}

const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), '.data', 'pg');
await rm(dir, { recursive: true, force: true });
console.log(`✓ removed ${dir}`);
console.log('Run `pnpm db:seed` to rebuild (migrations apply automatically).');
