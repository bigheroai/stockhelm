/**
 * Diagnoses a connection failure with the underlying cause, which drizzle wraps
 * and hides. Prints no credentials.
 *
 *   node --import ./scripts/register.mjs scripts/db-ping.ts
 */
import './load-env.mjs';

const url = (process.env.DATABASE_URL ?? '').trim();
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const { default: postgres } = await import('postgres');

const sql = postgres(url, {
  max: 1,
  connect_timeout: 15,
  ssl: /@(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/.test(url) ? undefined : 'require',
  onnotice: () => {},
});

try {
  const [row] = await sql`select version() as v, current_user as u, current_database() as d`;
  console.log('✓ connected');
  console.log(`  server: ${String(row.v).split(',')[0]}`);
  console.log(`  user:   ${row.u}`);
  console.log(`  db:     ${row.d}`);
} catch (error) {
  const err = error as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  console.error('✗ connection failed');
  console.error(`  code:    ${err.code ?? '(none)'}`);
  console.error(`  message: ${err.message}`);
  if (err.cause) {
    console.error(`  cause:   ${err.cause.code ?? ''} ${err.cause.message ?? String(err.cause)}`);
  }
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

export {};
