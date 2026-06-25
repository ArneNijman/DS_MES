ALTER TABLE "product_setup_steps"
  ADD COLUMN IF NOT EXISTS "cam_checklist_completed" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "cam_released_by_id"     uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "cam_released_by_name"   text,
  ADD COLUMN IF NOT EXISTS "cam_released_at"        timestamptz;
