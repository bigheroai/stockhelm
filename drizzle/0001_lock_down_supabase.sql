-- Locks the schema down for Supabase-hosted databases.
--
-- Supabase publishes every table in `public` through its auto-generated Data
-- API (PostgREST). This app never uses that API: it talks to Postgres over a
-- normal connection as the table owner, which bypasses RLS. Enabling RLS with
-- no policies, plus revoking the API roles, means the anon/public API keys can
-- read nothing even though the tables exist.
--
-- Bypassing RLS relies on connecting as the table owner (the `postgres` role,
-- which is what Supabase's connection strings use). If you connect as a
-- dedicated non-owner role, add explicit policies for it.

alter table "users" enable row level security;--> statement-breakpoint
alter table "sessions" enable row level security;--> statement-breakpoint
alter table "locations" enable row level security;--> statement-breakpoint
alter table "items" enable row level security;--> statement-breakpoint
alter table "stock_levels" enable row level security;--> statement-breakpoint
alter table "movements" enable row level security;--> statement-breakpoint
alter table "sales" enable row level security;--> statement-breakpoint
alter table "sale_lines" enable row level security;--> statement-breakpoint
alter table "payments" enable row level security;--> statement-breakpoint
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table
      public.users, public.sessions, public.locations, public.items,
      public.stock_levels, public.movements, public.sales,
      public.sale_lines, public.payments
      from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table
      public.users, public.sessions, public.locations, public.items,
      public.stock_levels, public.movements, public.sales,
      public.sale_lines, public.payments
      from authenticated';
  end if;
end $$;
