CREATE TABLE IF NOT EXISTS "customer_complaint_documents" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ctr_id"        uuid NOT NULL REFERENCES "customer_complaints"("id") ON DELETE CASCADE,
  "document_naam" text,
  "file_url"      text,
  "datum"         text,
  "created_at"    timestamptz DEFAULT now() NOT NULL
);
