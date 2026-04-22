DROP TABLE IF EXISTS "customer_complaints";

CREATE TABLE "customer_complaints" (
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
