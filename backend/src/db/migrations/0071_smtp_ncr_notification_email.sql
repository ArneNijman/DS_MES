ALTER TABLE "smtp_settings"
  ADD COLUMN IF NOT EXISTS "ncr_notification_email" text;
