ALTER TABLE "breakdowns"
  ADD COLUMN "resolved_by_type" text,
  ADD COLUMN "resolved_by_name" text,
  ADD COLUMN "werkbon_url" text,
  ADD COLUMN "werkbon_file_name" text;

CREATE TABLE "breakdown_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "breakdown_id" uuid NOT NULL,
  "file_url" text NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "breakdown_attachments_breakdown_fk"
    FOREIGN KEY ("breakdown_id") REFERENCES "public"."breakdowns"("id") ON DELETE CASCADE
);
