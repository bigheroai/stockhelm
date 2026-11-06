import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';
import { DatabaseConfigError, parseDatabaseTarget, resolveDatabaseUrl } from './target';

export type Db = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

const migrationsFolder = () => path.join(process.cwd(), 'drizzle');

let dbPromise: Promise<Db> | null = null;
let closeHandle: (() => Promise<void>) | null = null;

/** True when running inside a function host rather than a long-lived server. */
const isServerless = () =>
  Boolean(
    process.env.NETLIFY ||
      process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.CF_PAGES,
  );

/**
 * Serverless gets one connection per instance: fifty concurrent invocations
 * would otherwise try to open five hundred connections. Long-lived servers
 * keep a real pool.
 */
function poolMax(): number {
  const configured = Number(process.env.DATABASE_POOL_MAX);
  if (Number.isFinite(configured) && configured > 0) return Math.trunc(configured);
  return isServerless() ? 1 : 10;
}

async function createPglite(): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');

  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), '.data', 'pg');
  await mkdir(dir, { recursive: true });
  const pg = new PGlite(dir);
  closeHandle = () => pg.close();
  const db = drizzle(pg, { schema }) as unknown as Db;
  await migrate(db as never, { migrationsFolder: migrationsFolder() });
  return db;
}

async function createPostgres(url: string): Promise<Db> {
  const { default: postgres } = await import('postgres');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { migrate } = await import('drizzle-orm/postgres-js/migrator');

  const target = parseDatabaseTarget(url);

  const client = postgres(url, {
    max: poolMax(),
    // Transaction-mode pooling (Supabase :6543) cannot use prepared statements:
    // each statement may land on a different backend connection.
    prepare: target.prepare,
    // `require` encrypts without demanding a local CA bundle, which is what
    // Supabase's pooler expects. Local development usually has no TLS at all.
    ssl: target.ssl,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
  });

  closeHandle = () => client.end({ timeout: 5 });
  const db = drizzle(client, { schema }) as unknown as Db;
  if (process.env.AUTO_MIGRATE === 'true') {
    await migrate(db as never, { migrationsFolder: migrationsFolder() });
  }
  return db;
}

/**
 * Resolves the process-wide database handle.
 *
 * A connection string from the environment → that Postgres (Supabase, Neon, a
 * VPS, anything). Neither variable set → embedded PGlite on disk, for
 * development and tests.
 */
export function getDb(): Promise<Db> {
  if (!dbPromise) {
    let url: string | null;
    try {
      url = resolveDatabaseUrl();
    } catch (error) {
      return Promise.reject(error);
    }
    if (!url && isServerless()) {
      // PGlite needs a writable, persistent disk; a function host has neither.
      // Fail loudly instead of with an obscure filesystem error. Not cached, so
      // fixing the environment takes effect without a cold start.
      return Promise.reject(
        new DatabaseConfigError(
          'No Postgres connection string configured. Set DATABASE_URL to your ' +
            'Supabase transaction-pooler URL (postgres://…:6543/postgres). ' +
            'SUPABASE_DATABASE_URL from the Supabase integration is an HTTPS API URL ' +
            'and cannot be used for a database connection.',
        ),
      );
    }
    dbPromise = url ? createPostgres(url) : createPglite();
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
