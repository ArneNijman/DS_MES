CREATE TABLE "ncr_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ncr_id" uuid NOT NULL,
  "file_url" text NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ncr_attachments_ncr_fk" FOREIGN KEY ("ncr_id") REFERENCES "public"."ncr_registrations"("id") ON DELETE CASCADE
);
