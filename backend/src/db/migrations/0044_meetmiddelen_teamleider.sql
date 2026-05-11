ALTER TABLE "measuring_tools"
  ADD COLUMN IF NOT EXISTS "email_teamleider" text,
  ADD COLUMN IF NOT EXISTS "teamleider_id"    uuid REFERENCES "employees"("id") ON DELETE SET NULL;
