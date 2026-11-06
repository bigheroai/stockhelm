import { defineConfig } from 'drizzle-kit';

// Netlify applies everything in `netlify/database/migrations` automatically
// on deploy (before a production deploy is published, and on every deploy
// preview against its own database branch). `generate` never connects.
export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema.ts',
  out: 'netlify/database/migrations',
  verbose: true,
  strict: true,
});
