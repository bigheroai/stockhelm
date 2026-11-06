/**
 * Connection-string decisions that differ between a laptop, a VPS and a
 * serverless host. Kept pure so they can be tested without a server.
 */

export interface DatabaseTarget {
  /** Loopback host: usually no TLS, never a pooler. */
  local: boolean;
  port: number | null;
  /** Supavisor / PgBouncer host in front of Postgres. */
  pooler: boolean;
  /** Transaction-mode pooling: statements may change backend connections. */
  transactionPooler: boolean;
  /** Whether postgres.js may use prepared statements. */
  prepare: boolean;
  /** `undefined` disables TLS entirely (local development). */
  ssl: 'require' | undefined;
}

const LOCAL_HOST = /@(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/;

export function parseDatabaseTarget(url: string): DatabaseTarget {
  const local = LOCAL_HOST.test(url);
  const portMatch = url.match(/:(\d+)(?:\/|\?|$)/);
  const port = portMatch ? Number(portMatch[1]) : null;

  // SupABASE's pooler hostname, or the conventional transaction-mode port.
  const pooler = /pooler\.supabase\.com/.test(url) || port === 6543;
  const transactionPooler = port === 6543;

  const prepareOverride = process.env.DATABASE_PREPARE;
  const prepare =
    prepareOverride === undefined
      ? !transactionPooler
      : prepareOverride === 'true' || prepareOverride === '1';

  const sslOverride = process.env.DATABASE_SSL;
  const ssl =
    sslOverride === 'disable'
      ? undefined
      : local
        ? undefined
        : 'require';

  return { local, port, pooler, transactionPooler, prepare, ssl };
}

const POSTGRES_URL = /^postgres(?:ql)?:\/\//i;

/** Thrown when the environment names a database the app cannot connect to. */
export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseConfigError';
  }
}

/**
 * Picks the connection string from the environment.
 *
 * `DATABASE_URL` is ours and always wins. `SUPABASE_DATABASE_URL` is set by
 * the Netlify ↔ Supabase integration, but it holds the project's HTTPS API URL
 * (`https://<ref>.supabase.co`), not a Postgres connection string. It is only
 * used when it really is a `postgres://` URL; otherwise it is ignored.
 */
export function resolveDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const explicit = env.DATABASE_URL?.trim();
  if (explicit) {
    if (!POSTGRES_URL.test(explicit)) {
      throw new DatabaseConfigError(
        'DATABASE_URL must be a postgres:// connection string ' +
          '(Supabase: Project Settings → Database → Connection string → Transaction pooler).',
      );
    }
    return explicit;
  }
  const supabase = env.SUPABASE_DATABASE_URL?.trim();
  if (supabase && POSTGRES_URL.test(supabase)) return supabase;
  return null;
}
