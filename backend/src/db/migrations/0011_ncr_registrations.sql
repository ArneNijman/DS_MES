CREATE TABLE "ncr_registrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ncr_id" text UNIQUE NOT NULL,
  "production_order" text,
  "item_ref" text,
  "cause" text,
  "description" text,
  "status" text DEFAULT 'open' NOT NULL,
  "created_by_id" uuid REFERENCES "public"."employees"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
