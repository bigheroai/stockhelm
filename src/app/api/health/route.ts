import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Unauthenticated health probe. Deliberately leaks nothing but timing and the
 * region the function is running in — enough to confirm that your compute sits
 * near your database.
 *
 *   curl https://your-site.netlify.app/api/health
 */
export async function GET() {
  const started = performance.now();
  let dbOk = false;
  let dbLatencyMs: number | null = null;

  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    dbOk = true;
  } catch (error) {
    console.error('[health] database check failed', error);
  } finally {
    dbLatencyMs = Math.round(performance.now() - started);
  }

  return NextResponse.json(
    {
      ok: dbOk,
      dbLatencyMs,
      region:
        process.env.AWS_REGION ??
        process.env.VERCEL_REGION ??
        process.env.NETLIFY_REGION ??
        'unknown',
      timestamp: new Date().toISOString(),
    },
    { status: dbOk ? 200 : 503 },
  );
}
