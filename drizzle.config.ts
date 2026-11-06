import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  // `generate` never connects; this placeholder only satisfies the type.
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/stockroom' },
  verbose: true,
  strict: true,
});
