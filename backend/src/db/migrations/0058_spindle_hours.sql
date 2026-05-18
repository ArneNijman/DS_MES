ALTER TABLE "machines" ADD COLUMN "spindle_hours" numeric(10, 2);

CREATE TABLE "cnc_machine_metrics" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "machine_id"  uuid NOT NULL REFERENCES "machines"("id") ON DELETE CASCADE,
  "metric_type" text NOT NULL,
  "value"       numeric(12, 4) NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX ON "cnc_machine_metrics" ("machine_id", "metric_type", "recorded_at" DESC);
