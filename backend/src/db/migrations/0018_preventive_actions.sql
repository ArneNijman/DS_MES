CREATE TABLE "preventive_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "prev_id" text UNIQUE NOT NULL,
  "ncr_id" text,
  "status" text DEFAULT 'open' NOT NULL,
  "assigned_to_id" uuid REFERENCES "public"."employees"("id") ON DELETE SET NULL,
  "assigned_to_name" text,
  "datum" text,
  "description" text,
  "created_by_id" uuid REFERENCES "public"."employees"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
