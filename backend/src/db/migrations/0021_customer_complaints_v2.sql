CREATE TABLE IF NOT EXISTS "customer_complaints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ctr_id" text UNIQUE NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "datum_melding" text,
  "datum_afgesloten" text,
  "klant" text,
  "oorspronkelijk_ordernummer" text,
  "nieuw_ordernummer" text,
  "contactpersoon" text,
  "artikel" text,
  "email_contactpersoon" text,
  "oorzaak_code" text,
  "fout_code" text,
  "omschrijving" text,
  "created_by_name" text,
  "created_by_id" uuid REFERENCES "public"."employees"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "customer_complaints" ADD COLUMN IF NOT EXISTS "datum_melding" text;
ALTER TABLE "customer_complaints" ADD COLUMN IF NOT EXISTS "datum_afgesloten" text;
ALTER TABLE "customer_complaints" ADD COLUMN IF NOT EXISTS "klant" text;
ALTER TABLE "customer_complaints" ADD COLUMN IF NOT EXISTS "oorspronkelijk_ordernummer" text;
ALTER TABLE "customer_complaints" ADD COLUMN IF NOT EXISTS "nieuw_ordernummer" text;
ALTER TABLE "customer_complaints" ADD COLUMN IF NOT EXISTS "contactpersoon" text;
ALTER TABLE "customer_complaints" ADD COLUMN IF NOT EXISTS "artikel" text;
ALTER TABLE "customer_complaints" ADD COLUMN IF NOT EXISTS "email_contactpersoon" text;
ALTER TABLE "customer_complaints" ADD COLUMN IF NOT EXISTS "oorzaak_code" text;
ALTER TABLE "customer_complaints" ADD COLUMN IF NOT EXISTS "fout_code" text;
ALTER TABLE "customer_complaints" ADD COLUMN IF NOT EXISTS "omschrijving" text;
ALTER TABLE "customer_complaints" ADD COLUMN IF NOT EXISTS "created_by_name" text;
ALTER TABLE "customer_complaints" ADD COLUMN IF NOT EXISTS "created_by_id" uuid REFERENCES "public"."employees"("id") ON DELETE SET NULL;
