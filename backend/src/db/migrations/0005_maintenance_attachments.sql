CREATE TABLE "maintenance_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "maintenance_task_id" uuid NOT NULL,
  "file_url" text NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "maintenance_attachments_task_fk" FOREIGN KEY ("maintenance_task_id") REFERENCES "public"."maintenance_tasks"("id") ON DELETE CASCADE
);
