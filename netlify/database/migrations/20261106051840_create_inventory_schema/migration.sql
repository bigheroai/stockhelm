CREATE SEQUENCE "public"."sale_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1001 CACHE 1;--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"sku" text NOT NULL,
	"barcode" text,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"unit" text DEFAULT 'ea' NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"reorder_point" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_price_nonneg" CHECK ("price_cents" >= 0),
	CONSTRAINT "items_cost_nonneg" CHECK ("cost_cents" >= 0),
	CONSTRAINT "items_reorder_nonneg" CHECK ("reorder_point" >= 0)
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'bin' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"item_id" uuid NOT NULL,
	"from_location_id" uuid,
	"to_location_id" uuid,
	"qty" integer NOT NULL,
	"kind" text NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"note" text,
	"actor_id" uuid,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movements_qty_positive" CHECK ("qty" > 0),
	CONSTRAINT "movements_distinct_sides" CHECK ("from_location_id" IS DISTINCT FROM "to_location_id")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"sale_id" uuid NOT NULL,
	"method" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_positive" CHECK ("amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "sale_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"sale_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"line_total_cents" integer NOT NULL,
	CONSTRAINT "sale_lines_qty_positive" CHECK ("qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"number" text NOT NULL,
	"customer_name" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"actor_id" uuid,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	CONSTRAINT "sales_total_nonneg" CHECK ("total_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_levels" (
	"item_id" uuid,
	"location_id" uuid,
	"qty" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_levels_pkey" PRIMARY KEY("item_id","location_id"),
	CONSTRAINT "stock_levels_qty_nonneg" CHECK ("qty" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'clerk' NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "items_sku_key" ON "items" ("sku");--> statement-breakpoint
CREATE UNIQUE INDEX "items_barcode_key" ON "items" ("barcode");--> statement-breakpoint
CREATE INDEX "items_name_idx" ON "items" ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_code_key" ON "locations" ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "movements_idempotency_key" ON "movements" ("idempotency_key");--> statement-breakpoint
CREATE INDEX "movements_item_idx" ON "movements" ("item_id","created_at");--> statement-breakpoint
CREATE INDEX "movements_created_idx" ON "movements" ("created_at");--> statement-breakpoint
CREATE INDEX "movements_ref_idx" ON "movements" ("ref_type","ref_id");--> statement-breakpoint
CREATE INDEX "payments_sale_idx" ON "payments" ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_lines_sale_idx" ON "sale_lines" ("sale_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_number_key" ON "sales" ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_idempotency_key" ON "sales" ("idempotency_key");--> statement-breakpoint
CREATE INDEX "sales_created_idx" ON "sales" ("created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" ("user_id");--> statement-breakpoint
CREATE INDEX "stock_levels_location_idx" ON "stock_levels" ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" (lower("email"));--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_item_id_items_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id");--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_from_location_id_locations_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "locations"("id");--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_to_location_id_locations_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "locations"("id");--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_id_sales_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_sales_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_item_id_items_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id");--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_item_id_items_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_location_id_locations_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE;