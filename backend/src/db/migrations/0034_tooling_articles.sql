CREATE TABLE "tooling_articles" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "article_type"   text NOT NULL,
  "name"           text NOT NULL,
  "ordering_code"  text,
  "manufacturer"   text,
  "photo_url"      text,
  "source_item_id" uuid REFERENCES "tool_library_items"("id") ON DELETE SET NULL,
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  UNIQUE("article_type", "name")
);

CREATE TABLE "tooling_stock_locations" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "article_id"    uuid NOT NULL REFERENCES "tooling_articles"("id") ON DELETE CASCADE,
  "location_code" text NOT NULL,
  "quantity"      integer NOT NULL DEFAULT 0,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  UNIQUE("article_id", "location_code")
);

CREATE TABLE "tooling_mutations" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "article_id"     uuid NOT NULL REFERENCES "tooling_articles"("id") ON DELETE CASCADE,
  "employee_id"    uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "location_code"  text NOT NULL,
  "quantity_delta" integer NOT NULL,
  "created_at"     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "tooling_favorites" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "article_id"  uuid NOT NULL REFERENCES "tooling_articles"("id") ON DELETE CASCADE,
  UNIQUE("employee_id", "article_id")
);
