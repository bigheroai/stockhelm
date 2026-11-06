# Stockroom

Warehouse inventory **and** a counter till in one app: receive stock, move it between bins, count shelves, sell at the counter, and always be able to explain how a number got where it is.

Built with Next.js 16 (App Router), Postgres + Drizzle ORM, and no UI framework — plain CSS, server-rendered pages, and a small amount of client JavaScript only where it earns its keep (the till).

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
pnpm db:migrate                # create schema
pnpm db:seed                   # demo warehouse + staff + a few sales
pnpm dev                       # http://localhost:3000
```

Demo accounts created by the seed:

| Email | Password | Role |
|---|---|---|
| `admin@example.com` | `change-me-now` | admin |
| `clerk@example.com` | `counter-demo-1` | clerk |

> Change these before anyone else can reach the app.

With no `DATABASE_URL`, the app runs on **PGlite** — real Postgres compiled to WASM, stored in `.data/pg`. Nothing to install, and the schema and SQL are identical to production.

### Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | 26 unit tests against in-memory Postgres |
| `pnpm db:migrate` | Apply `drizzle/*.sql` |
| `pnpm db:seed` | Demo data (no-op if items exist) |
| `pnpm db:reset` | Delete the local PGlite database |
| `pnpm db:doctor` | Check a hosted database: transport, tables, RLS, ledger |
| `pnpm check:ledger` | Exit non-zero if balances disagree with the ledger |

---

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | *(unset)* | Unset = embedded PGlite (development only) |
| `DATABASE_POOL_MAX` | `1` serverless / `10` otherwise | Connections per instance |
| `DATABASE_PREPARE` | auto | Override prepared statements (`false` for exotic poolers) |
| `DATABASE_SSL` | `require` off-localhost | `disable` for a private network without TLS |
| `COMPANY_NAME` | `Stockroom` | Shown in the UI and on receipts |
| `CURRENCY` | `USD` | ISO-4217 code used for formatting |
| `TAX_RATE_BPS` | `0` | Basis points: `800` = 8% |
| `SALE_LOCATION_CODE` | `COUNTER` | Location that the till sells from |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | `admin@example.com` / `change-me-now` | Used only by `db:seed` |
| `AUTO_MIGRATE` | unset | `true` runs migrations at boot (VPS only, never serverless) |

---

## Deploying with Supabase

Supabase is plain Postgres, so nothing in the schema or the SQL changes. Three things are specific to it, and all three bite people who skip them.

### 1. You need two connection strings, not one

Supabase gives you several. Use them for different jobs:

| Job | Connection | Why |
|---|---|---|
| **Migrations** (`db:migrate`, `db:seed`) | **Direct**, port `5432` | DDL and the seed want a normal session, not a shared transaction pool |
| **The app at runtime** | **Pooler**, port `6543` (transaction mode) | IPv4-reachable and built for many short-lived connections |

The direct host (`db.<ref>.supabase.co`) is **IPv6-only** on new projects. Netlify Functions, Fly machines and most container runtimes have no IPv6 egress, so a direct connection from a serverless host fails with `ENETUNREACH` or `Cannot assign requested address`. The pooler hostname resolves over IPv4.

### 2. Migrate over the direct connection

```bash
export DATABASE_URL='postgres://postgres.<project-ref>:<password>@db.<project-ref>.supabase.co:5432/postgres'
pnpm db:migrate
SEED_ADMIN_EMAIL=you@company.com SEED_ADMIN_PASSWORD='a-long-password' SEED_DEMO=false pnpm db:seed
```

`SEED_DEMO=false` creates your administrator and the starter locations but skips the demo catalogue and the three fake sales. Leave it at the default (`true`) only if you want sample data to click around with.

If your database password contains `@ : / ? # %`, percent-encode it first (`@` → `%40`), or the URL will parse wrongly.

### 3. Run the app over the pooler

```
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
DATABASE_POOL_MAX=1
```

`DATABASE_POOL_MAX=1` matters: every serverless instance keeps its own pool. With the default of 10, fifty warm functions would ask Supabase for 500 connections and you would exhaust the project limit.

The app detects port `6543` and automatically disables prepared statements (`prepare: false`). PgBouncer in transaction mode hands each statement whatever backend is free, so a prepared statement can disappear between statements. Nothing else in this codebase depends on session state, so the only symptom of getting this wrong is intermittent `prepared statement "s0" already exists` errors.

### 4. Verify before pointing DNS at it

```bash
pnpm db:doctor
```

It reports the transport (direct vs pooler), server version, whether all 9 tables exist, whether RLS is on, row counts, and ledger drift.

### Security: the Data API is not your API

Supabase exposes everything in the `public` schema through its auto-generated REST/GraphQL endpoints. This app never uses them — it speaks Postgres directly — but the tables would still be readable by anyone holding your `anon` key.

Migration `0001_lock_down_supabase.sql` closes that: it enables Row Level Security on all nine tables and revokes `anon` / `authenticated`. Because the app connects as the table owner (`postgres`), it bypasses RLS; the public API keys see nothing.

Two consequences worth knowing:

- If you ever connect as a **custom non-owner role**, it will be blocked until you add policies for it.
- If you add tables later, enable RLS on those too. The migration is a snapshot, not a standing policy.

### Netlify

`netlify.toml` is included (build command, `NODE_VERSION=22`); Netlify auto-detects Next.js 16 and applies its OpenNext adapter.

### Connecting your Supabase account from Netlify

Netlify ships a [Supabase extension](https://docs.netlify.com/extend/install-and-use/setup-guides/supabase-integration/). Install it under **Team settings → Extensions**, connect it to your site, then choose the project.

It injects `SUPABASE_DATABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. **This app reads `SUPABASE_DATABASE_URL` automatically** when `DATABASE_URL` is empty, so the integration alone is enough to wire up credentials — nothing to copy by hand.

Two caveats:

- Check which transport it injected: `pnpm db:doctor` prints it. If that URL is the IPv6-only direct host, serverless functions cannot reach it — set `DATABASE_URL` to the pooler string instead; it takes precedence.
- The integration supplies credentials, not schema. You still run `pnpm db:migrate` and the first `db:seed` yourself.

Environment variables to set in the Netlify UI (skip `DATABASE_URL` if the integration is installed):

| Variable | Value |
|---|---|
| `DATABASE_URL` | the **pooler** string, port `6543` |
| `DATABASE_POOL_MAX` | `1` |
| `COMPANY_NAME` | your business name |
| `CURRENCY` | e.g. `USD`, `EUR`, `PHP` |
| `TAX_RATE_BPS` | `800` for 8%, `0` for none |
| `SALE_LOCATION_CODE` | `COUNTER` |

Do **not** set `AUTO_MIGRATE` on serverless: concurrent cold starts would race the migrator against itself. Run migrations from your laptop or CI before deploying.

Leave `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` set only for the first deploy, then remove them.

---

## Deploying to a VPS instead

A single Node process plus Postgres on a €5 box is cheaper and has no cold starts. Any managed Postgres works; or install it locally:

```sql
CREATE ROLE stockroom LOGIN PASSWORD 'strong-password-here';
CREATE DATABASE stockroom OWNER stockroom;
```

```bash
git clone <your-repo> /srv/stockroom && cd /srv/stockroom
pnpm install --frozen-lockfile
export DATABASE_URL='postgres://stockroom:...@127.0.0.1:5432/stockroom'
pnpm db:migrate && pnpm build
SEED_ADMIN_EMAIL=you@company.com SEED_ADMIN_PASSWORD='...' pnpm db:seed   # first deploy only
```

```ini
[Unit]
Description=Stockroom
After=network.target postgresql.service

[Service]
WorkingDirectory=/srv/stockroom
Environment=NODE_ENV=production
Environment=DATABASE_URL=postgres://stockroom:...@127.0.0.1:5432/stockroom
Environment=COMPANY_NAME=Acme Warehouse
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start -p 3000
Restart=always
User=stockroom

[Install]
WantedBy=multi-user.target
```

Proxy `127.0.0.1:3000` through nginx and terminate TLS with certbot. Session cookies are `Secure` in production, so plain HTTP will not keep you logged in — that is intentional. Back the database up (`pg_dump -Fc`, nightly) before you need it.

### PGlite is for development only

The embedded database is a **single-process** engine. Next.js renders pages and handles route requests in more than one process, so two PGlite instances fight over the same directory and you get stale reads — a receipt created a second ago can 404 until the server restarts. That is exactly what happened while building this.

Against a real `DATABASE_URL` the problem disappears: Postgres is built for concurrent connections. **Always set `DATABASE_URL` in production.**

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
    db/schema.ts      Drizzle schema — the constraints live here
    db/index.ts       driver selection (PGlite vs postgres.js) + closeDb()
    domain/           stock.ts, sales.ts, items.ts — all business rules
    queries.ts        read models for pages
    auth.ts           cookie/session glue (Next-only)
    sessions.ts       session persistence (no Next imports, usable in scripts)
    password.ts       scrypt hashing
tests/                26 tests against in-memory Postgres
drizzle/              SQL migrations
scripts/              migrate, seed, reset, ledger check, session helpers
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
