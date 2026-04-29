CREATE TABLE "product_setup_overdracht_photos" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "overdracht_id" uuid NOT NULL REFERENCES "product_setup_overdracht"("id") ON DELETE CASCADE,
  "file_url"      text NOT NULL,
  "file_name"     text NOT NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "product_setup_overdracht_photos_idx" ON "product_setup_overdracht_photos"("overdracht_id");
