ALTER TABLE "machines"
  ADD COLUMN IF NOT EXISTS "supplier_email"       text,
  ADD COLUMN IF NOT EXISTS "supplier_phone"       text,
  ADD COLUMN IF NOT EXISTS "maintenance_email_1"  text,
  ADD COLUMN IF NOT EXISTS "maintenance_phone_1"  text,
  ADD COLUMN IF NOT EXISTS "maintenance_email_2"  text,
  ADD COLUMN IF NOT EXISTS "maintenance_phone_2"  text;
