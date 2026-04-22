ALTER TABLE "ncr_registrations"
  ADD COLUMN "solution" text,
  ADD COLUMN "disposition_type" text,
  ADD COLUMN "resolved_by" text,
  ADD COLUMN "closed_by" text,
  ADD COLUMN "closed_at" text;
