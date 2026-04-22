CREATE TABLE "measuring_tools" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tool_id" text UNIQUE NOT NULL,
  "voorraad_id" text,
  "artikelnaam" text,
  "merk" text,
  "afmeting" text,
  "kalibratie_plicht" boolean DEFAULT false,
  "interval" text,
  "locatie" text,
  "email_teamleider" text,
  "gebruikt_door" text,
  "machine_id" uuid REFERENCES "public"."machines"("id") ON DELETE SET NULL,
  "photo_url" text,
  "actief" boolean DEFAULT true,
  "interne_kalibratie" boolean DEFAULT false,
  "externe_kalibratie" boolean DEFAULT false,
  "eindmaat_kalibratie" boolean DEFAULT false,
  "ring_kalibratie" boolean DEFAULT false,
  "diepte_kalibratie" boolean DEFAULT false,
  "instructie" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "calibration_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tool_id" uuid NOT NULL REFERENCES "public"."measuring_tools"("id") ON DELETE CASCADE,
  "gekalibreerd_door" text,
  "gekalibreerd_door_id" uuid REFERENCES "public"."employees"("id") ON DELETE SET NULL,
  "datum" text,
  "type" text DEFAULT 'intern',
  "certificaat_url" text,
  "certificaat_naam" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "tool_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tool_id" uuid NOT NULL REFERENCES "public"."measuring_tools"("id") ON DELETE CASCADE,
  "document_naam" text,
  "file_url" text,
  "datum" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
