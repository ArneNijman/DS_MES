ALTER TABLE "customer_complaints"
  ADD COLUMN IF NOT EXISTS "oplossing"    text,
  ADD COLUMN IF NOT EXISTS "besloten_door" jsonb DEFAULT '[]'::jsonb NOT NULL;
