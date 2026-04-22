CREATE TABLE "machine_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "machine_id" uuid NOT NULL,
  "document_type" text NOT NULL,
  "title" text NOT NULL,
  "file_url" text NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "machine_documents_machine_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE CASCADE
);
