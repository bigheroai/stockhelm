import { and, eq } from 'drizzle-orm';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { migrationsFolder, type Db } from '../src/lib/db';
import * as schema from '../src/lib/db/schema';

/**
 * Fresh in-memory Postgres (PGlite is real Postgres compiled to WASM) with the
 * production migrations applied. Each test gets its own instance.
 */
export async function makeTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const pg = new PGlite();
  const db = drizzle({ client: pg, schema }) as unknown as Db;
  await migrate(db as never, { migrationsFolder: migrationsFolder() });
  return {
    db,
    close: async () => {
      await pg.close();
    },
  };
}

export const ACTOR = null;

export async function makeShelf(db: Db) {
  const [bin, bin2, counter] = await db
    .insert(schema.locations)
    .values([
      { code: 'A-01', name: 'Aisle A · Bay 1', kind: 'bin' },
      { code: 'A-02', name: 'Aisle A · Bay 2', kind: 'bin' },
      { code: 'COUNTER', name: 'Sales counter', kind: 'counter' },
    ])
    .returning();

  const [item] = await db
    .insert(schema.items)
    .values({
      sku: 'TEST-1',
      barcode: '0000000000017',
      name: 'Test Widget',
      priceCents: 1000,
      costCents: 400,
      reorderPoint: 2,
    })
    .returning();

  return { bin, bin2, counter, item };
}

export async function balanceAt(db: Db, itemId: string, locationId: string): Promise<number> {
  const rows = await db
    .select()
    .from(schema.stockLevels)
    .where(and(eq(schema.stockLevels.itemId, itemId), eq(schema.stockLevels.locationId, locationId)));
  return rows[0]?.qty ?? 0;
}
