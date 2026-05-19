CREATE TABLE "cnc_machine_events" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "machine_id"   uuid NOT NULL REFERENCES "machines"("id") ON DELETE CASCADE,
  "event_type"   text NOT NULL,
  "event_data"   jsonb,
  "program_name" text,
  "occurred_at"  timestamp with time zone NOT NULL,
  "created_at"   timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX ON "cnc_machine_events" ("machine_id", "occurred_at" DESC);

CREATE TABLE "cnc_program_runs" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "machine_id"       uuid NOT NULL REFERENCES "machines"("id") ON DELETE CASCADE,
  "program_name"     text NOT NULL,
  "started_at"       timestamp with time zone NOT NULL,
  "ended_at"         timestamp with time zone,
  "duration_seconds" integer,
  "status"           text NOT NULL DEFAULT 'running',
  "created_at"       timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX ON "cnc_program_runs" ("machine_id", "started_at" DESC);
