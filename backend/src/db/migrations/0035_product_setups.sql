CREATE TABLE "product_setups" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "production_order_no" text,
  "article_no"          text,
  "article_name"        text NOT NULL,
  "description"         text,
  "origin"              text NOT NULL DEFAULT 'manual',
  "created_by"          uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "product_setups_created_at_idx"          ON "product_setups"("created_at" DESC);
CREATE INDEX "product_setups_production_order_no_idx" ON "product_setups"("production_order_no");
CREATE INDEX "product_setups_article_name_idx"        ON "product_setups"("article_name");

CREATE TABLE "product_setup_steps" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "setup_id"         uuid NOT NULL REFERENCES "product_setups"("id") ON DELETE CASCADE,
  "step_number"      integer NOT NULL,
  "step_name"        text NOT NULL,
  "machine_id"       uuid REFERENCES "machines"("id") ON DELETE SET NULL,
  "zero_x"           numeric(12,4),
  "zero_y"           numeric(12,4),
  "zero_z"           numeric(12,4),
  "step_description" text,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  "updated_at"       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX        "product_setup_steps_setup_id_idx"   ON "product_setup_steps"("setup_id");
CREATE INDEX        "product_setup_steps_machine_id_idx" ON "product_setup_steps"("machine_id");
CREATE UNIQUE INDEX "product_setup_steps_order_idx"      ON "product_setup_steps"("setup_id", "step_number");

CREATE TABLE "product_setup_nc_files" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "step_id"         uuid NOT NULL REFERENCES "product_setup_steps"("id") ON DELETE CASCADE,
  "file_name"       text NOT NULL,
  "program_name"    text,
  "file_content"    text NOT NULL,
  "tool_call_count" integer NOT NULL DEFAULT 0,
  "uploaded_at"     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "product_setup_nc_files_step_id_idx" ON "product_setup_nc_files"("step_id");

CREATE TABLE "product_setup_tool_calls" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "nc_file_id"    uuid NOT NULL REFERENCES "product_setup_nc_files"("id") ON DELETE CASCADE,
  "sequence"      integer NOT NULL,
  "tool_number"   integer,
  "tool_name"     text,
  "axis"          text,
  "spindle_speed" integer,
  "dl"            numeric(10,3),
  "dr"            numeric(10,3)
);
CREATE INDEX "product_setup_tool_calls_nc_file_id_idx" ON "product_setup_tool_calls"("nc_file_id");

CREATE TABLE "product_setup_documents" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "setup_id"      uuid NOT NULL REFERENCES "product_setups"("id") ON DELETE CASCADE,
  "document_type" text NOT NULL,
  "file_url"      text NOT NULL,
  "file_name"     text NOT NULL,
  "version_note"  text,
  "mime_type"     text,
  "uploaded_by"   uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "uploaded_at"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "product_setup_documents_setup_id_idx"    ON "product_setup_documents"("setup_id");
CREATE INDEX "product_setup_documents_setup_type_idx"  ON "product_setup_documents"("setup_id", "document_type");
CREATE INDEX "product_setup_documents_uploaded_at_idx" ON "product_setup_documents"("uploaded_at" DESC);

CREATE TABLE "product_setup_attachments" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "step_id"    uuid NOT NULL REFERENCES "product_setup_steps"("id") ON DELETE CASCADE,
  "file_url"   text NOT NULL,
  "file_name"  text NOT NULL,
  "caption"    text,
  "mime_type"  text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "product_setup_attachments_step_id_idx" ON "product_setup_attachments"("step_id");
