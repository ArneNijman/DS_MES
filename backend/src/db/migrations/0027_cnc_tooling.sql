CREATE TABLE IF NOT EXISTS "cnc_tool_entries" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "machine_id"  uuid NOT NULL REFERENCES "machines"("id") ON DELETE CASCADE,
  "tool_number" integer NOT NULL,
  "name"        text NOT NULL,
  "l"           numeric(10,3),
  "r"           numeric(10,3),
  "dl"          numeric(10,3),
  "dr"          numeric(10,3),
  "time2"       numeric(10,2),
  "cur_time"    numeric(10,2),
  "doc"         text,
  "locked"      boolean DEFAULT false,
  "synced_at"   timestamptz DEFAULT now() NOT NULL,
  "created_at"  timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "cnc_tool_entries_machine_id_idx" ON "cnc_tool_entries"("machine_id");

CREATE TABLE IF NOT EXISTS "cnc_sync_logs" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "machine_id"    uuid NOT NULL REFERENCES "machines"("id") ON DELETE CASCADE,
  "status"        text NOT NULL,
  "tools_count"   integer,
  "duration_ms"   integer,
  "error_message" text,
  "file_name"     text,
  "started_at"    timestamptz DEFAULT now() NOT NULL,
  "completed_at"  timestamptz
);

CREATE INDEX IF NOT EXISTS "cnc_sync_logs_machine_id_started_idx" ON "cnc_sync_logs"("machine_id", "started_at" DESC);
