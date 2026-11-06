# Stockroom

Warehouse inventory **and** a counter till in one app: receive stock, move it between bins, count shelves, sell at the counter, and always be able to explain how a number got where it is.

Built with Next.js 16 (App Router), Netlify Database (managed Postgres) + Drizzle ORM, and no UI framework — plain CSS, server-rendered pages, and a small amount of client JavaScript only where it earns its keep (the till).

---

## Why it is built this way

Most home-grown inventory systems rot for one reason: `stock.quantity` is a number you edit in place. The moment two people pick the same item at once, or someone "fixes" a count, history is gone and nobody can reconcile the shelf against the system.

Stockroom makes the **movement ledger** the only source of truth:

```
movements (append-only)
  item, from_location, to_location, qty, kind, actor, note, created_at
```

Every operation is a movement:

| Operation | Ledger entry |
|---|---|
| Receive a delivery | `null → bin` |
| Move between bins | `bin → bin` |
| Cycle count | `bin → null` (short) or `null → bin` (surplus) |
| Counter sale | `counter → null` |
| Void a sale | `null → counter` (mirrors the original sale exactly) |

`stock_levels` is a **cache** of that ledger, kept in the same transaction. It exists for two reasons: fast reads, and a `CHECK (qty >= 0)` constraint so the database itself refuses to go negative. If it ever drifts, one button in Settings (or `pnpm check:ledger` + rebuild) recomputes it from the movements — no data is lost.

Concurrency is handled by the guard, not by hope:

```sql
UPDATE stock_levels SET qty = qty - $n
WHERE item_id = $item AND location_id = $loc AND qty >= $n
```

The loser of a race matches zero rows and the whole transaction rolls back — including the sale row, the receipt lines and the payment. Two cashiers cannot sell the same last unit.

---

## What is in it

**Stock**
- Item catalogue with SKU, barcode, unit, cost, price, reorder point
- Receive against a supplier note, into any location
- Transfer between bins (fails atomically if the source is short)
- Cycle count that sets the shelf to the counted quantity and records the delta with a reason
- Full append-only ledger, filterable by movement type
- Low-stock report driven by each item's reorder point

**Counter**
- Barcode/keyboard-wedge scanning, search-as-you-type, click-to-add
- Cart with quantity controls, live totals and tax
- Cash (with change), card, transfer
- Receipt page with print styles; sale void restores stock exactly
- Idempotency key per cart, so a double-tapped **Charge** cannot produce two receipts

**Platform**
- Email/password auth with scrypt hashing and server-side sessions
- Every mutation is attributed to a user
- Money stored as integer cents, never floats
- Tax as basis points, snapshotted onto each sale so historical receipts never change
- Ledger integrity check exposed in Settings and as a CI script

---

## Quick start

```bash
pnpm install
cp .env.example .env.local     # optional: sane defaults are built in
pnpm db:seed                   # demo warehouse + staff + a few sales
pnpm dev                       # http://localhost:3000
```

Demo accounts created by the seed:

| Email | Password | Role |
|---|---|---|
| `admin@example.com` | `change-me-now` | admin |
| `clerk@example.com` | `counter-demo-1` | clerk |

> Change these before anyone else can reach the app.

Run with plain `pnpm dev` and the app uses **PGlite** — real Postgres compiled to WASM, stored in `.data/pg`, with the same migrations applied on startup. Run with `netlify dev` instead and it uses a local Netlify Database. Nothing to install either way.

### Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | 29 unit tests against in-memory Postgres |
| `pnpm db:generate <name>` | Write a new migration after editing `db/schema.ts` |
| `pnpm db:seed` | Demo data (no-op if items exist) |
| `pnpm db:reset` | Delete the local PGlite database |
| `pnpm check:ledger` | Exit non-zero if balances disagree with the ledger |

---

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `COMPANY_NAME` | `Stockroom` | Shown in the UI and on receipts |
| `CURRENCY` | `USD` | ISO-4217 code used for formatting |
| `TAX_RATE_BPS` | `0` | Basis points: `800` = 8% |
| `SALE_LOCATION_CODE` | `COUNTER` | Location that the till sells from |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | `admin@example.com` / `change-me-now` | Used only by `db:seed` |

---

## Deploying on Netlify

Data lives in **Netlify Database**, the managed Postgres attached to the site. There are no connection strings to copy and no environment variables to set: deployed functions find the database on their own.

- **Migrations** live in `netlify/database/migrations/` and are applied by Netlify during each deploy, just before it is published. A failing migration stops the deploy instead of publishing broken code.
- **Deploy previews** get their own database branch, copied from production, so trying a change never touches live data.
- **Changing the schema:** edit `db/schema.ts`, then run `pnpm db:generate <what_changed>` (e.g. `add_item_supplier`) and commit the new migration. Never edit a migration that has already been deployed; add another one.

### First run

A brand-new database has no accounts. The first visit to `/login` shows a **Set up** form instead of sign-in. It creates the administrator, adds the sales counter and inbound staging locations, and signs you in. It works only once: after the first account exists, the form is gone and the server refuses any further attempt.

Open the site and complete setup right after the first deploy, so nobody else gets there first.

### Verify

```bash
curl https://<site>.netlify.app/api/health
```

`"ok": true` means the function reached the database.

---

## How the code is organised

```
src/
  app/
    (app)/            authenticated pages: dashboard, items, receive, transfer,
                      count, movements, pos, sales, settings
    actions/          server actions (mutations) + shared form-state shapes
    api/pos/          JSON endpoints used by the till (also handy for handhelds)
    login/            sign-in
  lib/
    db/index.ts       driver selection (Netlify Database vs PGlite) + closeDb()
    domain/           stock.ts, sales.ts, items.ts, setup.ts — all business rules
    queries.ts        read models for pages
    auth.ts           cookie/session glue (Next-only)
    sessions.ts       session persistence (no Next imports, usable in scripts)
    password.ts       scrypt hashing
db/schema.ts          Drizzle schema — the constraints live here
netlify/database/migrations/   SQL migrations, applied by Netlify on deploy
tests/                29 tests against in-memory Postgres
scripts/              seed, reset, ledger check, session helpers
```

Business rules live in `src/lib/domain/*` as plain functions that take a database handle. Server actions and API routes are thin adapters. That is why the tests can exercise the real logic — including transactions — without starting a browser or a server.

Two details worth knowing if you extend it:

- A `'use server'` module may only export async functions. Shared constants (like idle form state) live in `src/app/actions/state.ts`; exporting an object from an action file fails the build.
- Scripts run on **native Node type stripping** (`node --import ./scripts/register.mjs`), not tsx or ts-node — no transpiler process, no extra dependency. The tiny resolver maps `@/` and extension-less imports.

---

## Testing

```bash
pnpm test
```

Each test gets a fresh Postgres with the real migrations applied. The suite covers:

- Receipts (including idempotent replays and invalid quantities)
- Transfers, overdraw refusal, same-location refusal
- Counts: shortfall, surplus, no-op, missing reason
- Ledger rebuild reproducing balances exactly
- Database-level rejection of negative stock and zero-quantity movements
- Sales: totals, basis-point tax rounding, change
- Oversell refusal with nothing written; whole-basket rollback
- Idempotent checkout; void restoring stock; double-void refusal
- Duplicate-line merging, empty basket rejection
- Barcode/SKU lookup
- First-run setup: creates exactly one administrator, never a second

---

## Deliberately not built (yet)

These are the obvious next steps, roughly in order of value:

1. **Purchase orders** — receiving currently records stock, not commitments.
2. **Suppliers and customers as records**, rather than free-text notes.
3. **Serialised items** — one row per unit, for tools and equipment with a service history.
4. **Offline till** — queue sales in the browser and replay with the idempotency key that is already in the contract.
5. **Role enforcement** — `admin` and `clerk` exist on users but are not yet checked per action.
6. **CSV import/export** for the catalogue and stock takes.
7. **Barcode label printing** (ZPL) straight from the item page.

The data model already leaves room for all of these: `movements.ref_type`/`ref_id` can point at a purchase order or a job, and a serialised item is just a movement per unit.
