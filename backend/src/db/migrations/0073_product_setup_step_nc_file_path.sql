ALTER TABLE "product_setup_steps"
  ADD COLUMN IF NOT EXISTS "nc_file_path" text;

ALTER TABLE "product_setup_nc_files"
  ADD COLUMN IF NOT EXISTS "source_modified_at" timestamptz;
