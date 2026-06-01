ALTER TABLE "smtp_settings"
  ADD COLUMN IF NOT EXISTS "interval_taken"     text NOT NULL DEFAULT 'dagelijks',
  ADD COLUMN IF NOT EXISTS "interval_ncr"       text NOT NULL DEFAULT 'dagelijks',
  ADD COLUMN IF NOT EXISTS "interval_onderhoud" text NOT NULL DEFAULT 'wekelijks',
  ADD COLUMN IF NOT EXISTS "interval_kalibratie" text NOT NULL DEFAULT 'wekelijks',
  ADD COLUMN IF NOT EXISTS "interval_kwaliteit"  text NOT NULL DEFAULT 'dagelijks';
