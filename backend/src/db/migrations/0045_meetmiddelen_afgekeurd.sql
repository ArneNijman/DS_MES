ALTER TABLE "measuring_tools"
  ADD COLUMN IF NOT EXISTS "afgekeurd"       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "afgekeurd_reden" text;
