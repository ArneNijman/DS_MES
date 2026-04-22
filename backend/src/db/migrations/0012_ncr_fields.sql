ALTER TABLE "ncr_registrations"
  ADD COLUMN "item_name" text,
  ADD COLUMN "production_step" text,
  ADD COLUMN "written_by_name" text,
  ADD COLUMN "written_by_department" text,
  ADD COLUMN "causing_department" text,
  ADD COLUMN "fault_code" text,
  ADD COLUMN "cause_code" text,
  ADD COLUMN "short_description" text,
  ADD COLUMN "measure_required" boolean,
  ADD COLUMN "pe_email" text;
