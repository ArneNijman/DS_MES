ALTER TABLE "ncr_registrations"
  ADD COLUMN "assigned_to_id" uuid
  REFERENCES "public"."employees"("id") ON DELETE SET NULL;
