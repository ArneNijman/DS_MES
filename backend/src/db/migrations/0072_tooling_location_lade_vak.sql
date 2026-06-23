ALTER TABLE "tooling_stock_locations"
  ADD COLUMN IF NOT EXISTS "lade" text,
  ADD COLUMN IF NOT EXISTS "vak" text;
