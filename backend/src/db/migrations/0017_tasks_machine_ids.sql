ALTER TABLE "tasks" DROP COLUMN IF EXISTS "machine_id";
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "machine_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;
