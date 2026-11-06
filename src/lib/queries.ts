import { and, asc, count, desc, eq, gt, gte, ilike, isNotNull, or, sql, sum } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { items, locations, movements, sales, saleLines, stockLevels, users } from '@/lib/db/schema';
import { config } from '@/lib/config';

export interface ItemRow {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  unit: string;
  priceCents: number;
  costCents: number;
  reorderPoint: number;
  active: boolean;
  onHand: number;
  stockValueCents: number;
}

const onHandExpr = sql<number>`coalesce(sum(${stockLevels.qty}), 0)::int`;

export async function listItems(db: Db, search = ''): Promise<ItemRow[]> {
  const term = search.trim();
  const where = term
    ? or(
        ilike(items.sku, `%${term}%`),
        ilike(items.name, `%${term}%`),
        ilike(items.barcode, `%${term}%`),
      )
    : undefined;

  const rows = await db
    .select({
      id: items.id,
      sku: items.sku,
      barcode: items.barcode,
      name: items.name,
      unit: items.unit,
      priceCents: items.priceCents,
      costCents: items.costCents,
      reorderPoint: items.reorderPoint,
      active: items.active,
      onHand: onHandExpr,
    })
    .from(items)
    .leftJoin(stockLevels, eq(stockLevels.itemId, items.id))
    .where(where)
    .groupBy(items.id)
    .orderBy(asc(items.name))
    .limit(300);

  return rows.map((r) => ({ ...r, stockValueCents: r.onHand * r.costCents }));
}

export async function getItem(db: Db, id: string) {
  const [item] = await db.select().from(items).where(eq(items.id, id)).limit(1);
  if (!item) return null;
  const levels = await db
    .select({
      locationId: locations.id,
      code: locations.code,
      name: locations.name,
      kind: locations.kind,
      qty: stockLevels.qty,
    })
    .from(stockLevels)
    .innerJoin(locations, eq(locations.id, stockLevels.locationId))
    .where(eq(stockLevels.itemId, id))
    .orderBy(asc(locations.code));
  const history = await db
    .select({
      id: movements.id,
      kind: movements.kind,
      qty: movements.qty,
      note: movements.note,
      createdAt: movements.createdAt,
      fromCode: sql<string | null>`(select code from locations where id = ${movements.fromLocationId})`,
      toCode: sql<string | null>`(select code from locations where id = ${movements.toLocationId})`,
    })
    .from(movements)
    .where(eq(movements.itemId, id))
    .orderBy(desc(movements.createdAt))
    .limit(40);
  return { item, levels, history, onHand: levels.reduce((s, l) => s + l.qty, 0) };
}

export async function listLocations(db: Db) {
  return db
    .select({
      id: locations.id,
      code: locations.code,
      name: locations.name,
      kind: locations.kind,
      active: locations.active,
      units: sql<number>`coalesce((select sum(qty) from stock_levels where location_id = ${locations.id}), 0)::int`,
      skus: sql<number>`coalesce((select count(*) from stock_levels where location_id = ${locations.id} and qty > 0), 0)::int`,
    })
    .from(locations)
    .orderBy(asc(locations.code));
}

export async function listActiveBins(db: Db) {
  return db
    .select({ id: locations.id, code: locations.code, name: locations.name, kind: locations.kind })
    .from(locations)
    .where(eq(locations.active, true))
    .orderBy(asc(locations.code));
}

/** Items with stock at a given location, joined with list price. */
export async function stockAtLocation(db: Db, locationId: string) {
  return db
    .select({
      itemId: items.id,
      sku: items.sku,
      name: items.name,
      unit: items.unit,
      priceCents: items.priceCents,
      reorderPoint: items.reorderPoint,
      qty: stockLevels.qty,
    })
    .from(stockLevels)
    .innerJoin(items, eq(items.id, stockLevels.itemId))
    .where(and(eq(stockLevels.locationId, locationId), gt(stockLevels.qty, 0), eq(items.active, true)))
    .orderBy(asc(items.name))
    .limit(500);
}

export async function lowStock(db: Db, limit = 50) {
  const rows = await db
    .select({
      id: items.id,
      sku: items.sku,
      name: items.name,
      unit: items.unit,
      reorderPoint: items.reorderPoint,
      onHand: onHandExpr,
    })
    .from(items)
    .leftJoin(stockLevels, eq(stockLevels.itemId, items.id))
    .where(and(eq(items.active, true), gt(items.reorderPoint, 0)))
    .groupBy(items.id)
    .having(sql`coalesce(sum(${stockLevels.qty}), 0) <= ${items.reorderPoint}`)
    .orderBy(asc(items.name))
    .limit(limit);
  return rows;
}

export async function dashboardMetrics(db: Db) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [salesToday] = await db
    .select({
      count: count(sales.id),
      total: sql<number>`coalesce(sum(${sales.totalCents}), 0)::int`,
    })
    .from(sales)
    .where(and(eq(sales.status, 'paid'), gte(sales.paidAt, startOfDay)));

  const [inventory] = await db
    .select({
      units: sql<number>`coalesce(sum(${stockLevels.qty}), 0)::int`,
      value: sql<number>`coalesce(sum(${stockLevels.qty} * ${items.costCents}), 0)::int`,
    })
    .from(stockLevels)
    .innerJoin(items, eq(items.id, stockLevels.itemId));

  const [skuCount] = await db
    .select({ count: count(items.id) })
    .from(items)
    .where(eq(items.active, true));

  const [movementCount] = await db.select({ count: count(movements.id) }).from(movements);

  return {
    salesTodayCount: Number(salesToday?.count ?? 0),
    salesTodayCents: Number(salesToday?.total ?? 0),
    unitsOnHand: Number(inventory?.units ?? 0),
    stockValueCents: Number(inventory?.value ?? 0),
    activeSkus: Number(skuCount?.count ?? 0),
    movementCount: Number(movementCount?.count ?? 0),
  };
}

export async function recentMovements(db: Db, limit = 25) {
  return db
    .select({
      id: movements.id,
      kind: movements.kind,
      qty: movements.qty,
      note: movements.note,
      createdAt: movements.createdAt,
      sku: items.sku,
      itemName: items.name,
      unit: items.unit,
      fromCode: sql<string | null>`(select code from locations where id = ${movements.fromLocationId})`,
      toCode: sql<string | null>`(select code from locations where id = ${movements.toLocationId})`,
      actor: users.name,
    })
    .from(movements)
    .innerJoin(items, eq(items.id, movements.itemId))
    .leftJoin(users, eq(users.id, movements.actorId))
    .orderBy(desc(movements.createdAt))
    .limit(limit);
}

export async function listSales(db: Db, limit = 50) {
  const rows = await db
    .select({
      id: sales.id,
      number: sales.number,
      customerName: sales.customerName,
      status: sales.status,
      totalCents: sales.totalCents,
      createdAt: sales.createdAt,
      paidAt: sales.paidAt,
      lineCount: sql<number>`(select count(*) from sale_lines where sale_id = ${sales.id})::int`,
      actor: users.name,
    })
    .from(sales)
    .leftJoin(users, eq(users.id, sales.actorId))
    .orderBy(desc(sales.createdAt))
    .limit(limit);
  return rows;
}

export async function topSellers(db: Db, limit = 8) {
  return db
    .select({
      itemId: saleLines.itemId,
      name: items.name,
      sku: items.sku,
      units: sql<number>`sum(${saleLines.qty})::int`,
      revenue: sql<number>`sum(${saleLines.lineTotalCents})::int`,
    })
    .from(saleLines)
    .innerJoin(sales, eq(sales.id, saleLines.saleId))
    .innerJoin(items, eq(items.id, saleLines.itemId))
    .where(eq(sales.status, 'paid'))
    .groupBy(saleLines.itemId, items.name, items.sku)
    .orderBy(desc(sql`sum(${saleLines.lineTotalCents})`))
    .limit(limit);
}

export async function searchForSale(db: Db, query: string, locationId: string) {
  const term = query.trim();
  const where = term
    ? or(
        ilike(items.sku, `%${term}%`),
        ilike(items.name, `%${term}%`),
        eq(items.barcode, term),
      )
    : undefined;
  return db
    .select({
      id: items.id,
      sku: items.sku,
      name: items.name,
      unit: items.unit,
      priceCents: items.priceCents,
      qty: sql<number>`coalesce(${stockLevels.qty}, 0)::int`,
    })
    .from(items)
    .leftJoin(
      stockLevels,
      and(eq(stockLevels.itemId, items.id), eq(stockLevels.locationId, locationId)),
    )
    .where(and(eq(items.active, true), where))
    .orderBy(asc(items.name))
    .limit(60);
}

export async function saleLocationId(db: Db): Promise<string | null> {
  const [row] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.code, config.saleLocationCode), eq(locations.active, true)))
    .limit(1);
  return row?.id ?? null;
}

/** Integrity check: does the cached balance table still equal the ledger? */
export async function ledgerDrift(db: Db) {
  const result = await db.execute(sql`
    with flows as (
      select item_id, location_id, sum(delta)::int as qty from (
        select item_id, to_location_id as location_id, qty as delta
          from movements where to_location_id is not null
        union all
        select item_id, from_location_id, -qty
          from movements where from_location_id is not null
      ) f group by 1, 2
    )
    select
      (select count(*) from stock_levels) as level_rows,
      (select count(*) from flows) as ledger_rows,
      (select count(*) from stock_levels s
         join flows f using (item_id, location_id)
        where s.qty <> f.qty) as mismatched
  `);
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
  const row = rows[0] as { level_rows?: number; ledger_rows?: number; mismatched?: number } | undefined;
  return {
    levelRows: Number(row?.level_rows ?? 0),
    ledgerRows: Number(row?.ledger_rows ?? 0),
    mismatched: Number(row?.mismatched ?? 0),
  };
}
