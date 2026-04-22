-- Uniforme componentenlijst (houder, snijgereedschap, verlengstuk/adapter)
CREATE TABLE IF NOT EXISTS "tool_library_items" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_id"     integer NOT NULL,
  "item_type"     text NOT NULL,
  "item_category" text,
  "name"          text NOT NULL,
  "comment"       text,
  "ordering_code" text,
  "manufacturer"  text,
  "imported_at"   timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "tool_library_items_item_type_idx" ON "tool_library_items"("item_type");
CREATE INDEX IF NOT EXISTS "tool_library_items_name_idx"      ON "tool_library_items"("name");

-- Samenstellingen (NCTools uit TDM)
CREATE TABLE IF NOT EXISTS "tool_library_assemblies" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nc_number"       integer NOT NULL,
  "nc_name"         text NOT NULL,
  "comment"         text,
  "tool_length"     double precision,
  "preset_diameter" double precision,
  "tool_item_id"    uuid REFERENCES "tool_library_items"("id"),
  "holder_item_id"  uuid REFERENCES "tool_library_items"("id"),
  "imported_at"     timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "tool_library_assemblies_nc_name_idx"   ON "tool_library_assemblies"("nc_name");
CREATE INDEX IF NOT EXISTS "tool_library_assemblies_nc_number_idx" ON "tool_library_assemblies"("nc_number");

-- Tussenstukken (Components → Extensions)
CREATE TABLE IF NOT EXISTS "tool_library_assembly_components" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "assembly_id" uuid NOT NULL REFERENCES "tool_library_assemblies"("id") ON DELETE CASCADE,
  "item_id"     uuid NOT NULL REFERENCES "tool_library_items"("id"),
  "position"    integer NOT NULL,
  "reach"       double precision
);

CREATE INDEX IF NOT EXISTS "tool_library_assembly_components_assembly_id_idx" ON "tool_library_assembly_components"("assembly_id");
