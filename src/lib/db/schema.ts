import {
  boolean,
  check,
  index,
  integer,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Human-facing document numbers come from a sequence so that two concurrent
 * tills can never mint the same receipt number.
 */
export const saleNumberSeq = pgSequence('sale_number_seq', { startWith: 1001 });

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role').$type<'admin' | 'clerk'>().notNull().default('clerk'),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('users_email_key').on(sql`lower(${t.email})`),
]);

export const sessions = pgTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('sessions_user_idx').on(t.userId)]);

/**
 * Every place stock can sit. `kind` separates real shelf space from the
 * virtual buckets the ledger needs (in-transit, supplier, write-off).
 */
export const locations = pgTable('locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  kind: text('kind').$type<'bin' | 'counter' | 'staging' | 'virtual'>().notNull().default('bin'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('locations_code_key').on(t.code)]);

export const items = pgTable('items', {
  id: uuid('id').primaryKey().defaultRandom(),
  sku: text('sku').notNull(),
  barcode: text('barcode'),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  unit: text('unit').notNull().default('ea'),
  priceCents: integer('price_cents').notNull().default(0),
  costCents: integer('cost_cents').notNull().default(0),
  reorderPoint: integer('reorder_point').notNull().default(0),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('items_sku_key').on(t.sku),
  uniqueIndex('items_barcode_key').on(t.barcode),
  index('items_name_idx').on(t.name),
  check('items_price_nonneg', sql`${t.priceCents} >= 0`),
  check('items_cost_nonneg', sql`${t.costCents} >= 0`),
  check('items_reorder_nonneg', sql`${t.reorderPoint} >= 0`),
]);

/**
 * Derived balance per (item, location). The ledger is the source of truth;
 * this table exists so reads are fast and so the database itself can refuse
 * to go negative. Rebuildable at any time from `movements`.
 */
export const stockLevels = pgTable('stock_levels', {
  itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  locationId: uuid('location_id').notNull().references(() => locations.id, { onDelete: 'cascade' }),
  qty: integer('qty').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.itemId, t.locationId] }),
  index('stock_levels_location_idx').on(t.locationId),
  check('stock_levels_qty_nonneg', sql`${t.qty} >= 0`),
]);

/**
 * Append-only ledger. A row moves `qty` units from `fromLocationId` to
 * `toLocationId`; a null side means outside the warehouse (supplier, scrap,
 * customer). Rows are never updated or deleted.
 */
export const movements = pgTable('movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  itemId: uuid('item_id').notNull().references(() => items.id),
  fromLocationId: uuid('from_location_id').references(() => locations.id),
  toLocationId: uuid('to_location_id').references(() => locations.id),
  qty: integer('qty').notNull(),
  kind: text('kind').$type<'receive' | 'transfer' | 'adjust' | 'sale' | 'void'>().notNull(),
  refType: text('ref_type'),
  refId: text('ref_id'),
  note: text('note'),
  actorId: uuid('actor_id').references(() => users.id),
  idempotencyKey: text('idempotency_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('movements_idempotency_key').on(t.idempotencyKey),
  index('movements_item_idx').on(t.itemId, t.createdAt),
  index('movements_created_idx').on(t.createdAt),
  index('movements_ref_idx').on(t.refType, t.refId),
  check('movements_qty_positive', sql`${t.qty} > 0`),
  check('movements_distinct_sides', sql`${t.fromLocationId} IS DISTINCT FROM ${t.toLocationId}`),
]);

export const sales = pgTable('sales', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: text('number').notNull(),
  customerName: text('customer_name').notNull().default(''),
  status: text('status').$type<'open' | 'paid' | 'void'>().notNull().default('open'),
  subtotalCents: integer('subtotal_cents').notNull().default(0),
  taxCents: integer('tax_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull().default(0),
  taxRateBps: integer('tax_rate_bps').notNull().default(0),
  note: text('note').notNull().default(''),
  actorId: uuid('actor_id').references(() => users.id),
  idempotencyKey: text('idempotency_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('sales_number_key').on(t.number),
  uniqueIndex('sales_idempotency_key').on(t.idempotencyKey),
  index('sales_created_idx').on(t.createdAt),
  check('sales_total_nonneg', sql`${t.totalCents} >= 0`),
]);

export const saleLines = pgTable('sale_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  saleId: uuid('sale_id').notNull().references(() => sales.id, { onDelete: 'cascade' }),
  itemId: uuid('item_id').notNull().references(() => items.id),
  qty: integer('qty').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  lineTotalCents: integer('line_total_cents').notNull(),
}, (t) => [
  index('sale_lines_sale_idx').on(t.saleId),
  check('sale_lines_qty_positive', sql`${t.qty} > 0`),
]);

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  saleId: uuid('sale_id').notNull().references(() => sales.id, { onDelete: 'cascade' }),
  method: text('method').$type<'cash' | 'card' | 'transfer'>().notNull(),
  amountCents: integer('amount_cents').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('payments_sale_idx').on(t.saleId),
  check('payments_amount_positive', sql`${t.amountCents} > 0`),
]);

export type User = typeof users.$inferSelect;
export type Item = typeof items.$inferSelect;
export type Location = typeof locations.$inferSelect;
export type Movement = typeof movements.$inferSelect;
export type Sale = typeof sales.$inferSelect;
export type SaleLine = typeof saleLines.$inferSelect;
export type Payment = typeof payments.$inferSelect;
