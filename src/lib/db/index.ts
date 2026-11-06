import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { PgAsyncDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export type Db = PgAsyncDatabase<PgQueryResultHKT, typeof schema>;

/** Where Netlify (and the embedded dev database) read migrations from. */
export const migrationsFolder = () => path.join(process.cwd(), 'netlify', 'database', 'migrations');

let dbPromise: Promise<Db> | null = null;
let closeHandle: (() => Promise<void>) | null = null;

/** Thrown when the app runs on Netlify without a database attached. */
export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseConfigError';
  }
}

/**
 * Netlify Database sets NETLIFY_DB_URL on deployed functions and under
 * `netlify dev`. Its presence is what selects the managed database.
 */
export const hasNetlifyDatabase = (env: Record<string, string | undefined> = process.env) =>
  Boolean(env.NETLIFY_DB_URL?.trim());

const isNetlifyRuntime = () => Boolean(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);

async function createNetlifyDb(): Promise<Db> {
  const { drizzle } = await import('drizzle-orm/netlify-db');
  // Connection details come from the environment; migrations are applied by
  // the Netlify platform during deploy, never by the app.
  return drizzle({ schema }) as unknown as Db;
}

async function createPglite(): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');

  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), '.data', 'pg');
  await mkdir(dir, { recursive: true });
  const pg = new PGlite(dir);
  closeHandle = () => pg.close();
  const db = drizzle({ client: pg, schema }) as unknown as Db;
  await migrate(db as never, { migrationsFolder: migrationsFolder() });
  return db;
}

/**
 * Resolves the process-wide database handle.
 *
 * On Netlify (or under `netlify dev`) → Netlify Database, the managed Postgres
 * attached to this site. Anywhere else → embedded PGlite on disk, for offline
 * development and the seed script.
 */
export function getDb(): Promise<Db> {
  if (!dbPromise) {
    if (hasNetlifyDatabase()) {
      dbPromise = createNetlifyDb();
    } else if (isNetlifyRuntime()) {
      // PGlite needs a writable, persistent disk; a function host has neither.
      // Not cached, so attaching the database takes effect without a cold start.
      return Promise.reject(
        new DatabaseConfigError(
          'Netlify Database is not connected to this deploy (NETLIFY_DB_URL is not set).',
        ),
      );
    } else {
      dbPromise = createPglite();
    }
  }
  return dbPromise;
}

/**
 * Flushes and releases the connection. CLI scripts must call this before
 * exiting: PGlite buffers writes and `process.exit()` would drop them.
 */
export async function closeDb(): Promise<void> {
  if (closeHandle) {
    const close = closeHandle;
    closeHandle = null;
    dbPromise = null;
    await close();
  }
}

export { schema };
