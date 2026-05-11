ALTER TABLE "ncr_registrations"
  ALTER COLUMN "human_factor" TYPE text[]
  USING CASE WHEN human_factor IS NULL THEN NULL ELSE ARRAY[human_factor] END;
