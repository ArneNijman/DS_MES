CREATE TABLE "internal_calibration_sessions" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tool_id"               uuid NOT NULL REFERENCES "measuring_tools"("id") ON DELETE CASCADE,
  "voltooiingsdatum"      text,
  "uitgevoerd_door"       text,
  "uitgevoerd_door_id"    uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "gecontroleer_door"     text,
  "gecontroleer_door_id"  uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"            timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "calibration_measurement_rows" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id"     uuid NOT NULL REFERENCES "internal_calibration_sessions"("id") ON DELETE CASCADE,
  "cal_type"       text NOT NULL,
  "nom_waarde"     text,
  "gemeten_waarde" text,
  "tolerantie"     text,
  "datum"          text,
  "din_norm"       text,
  "created_at"     timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "calibration_records"
  ADD COLUMN "gecontroleer_door"     text,
  ADD COLUMN "gecontroleer_door_id"  uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  ADD COLUMN "datum_weggestuurd"     text,
  ADD COLUMN "datum_terug"           text;

ALTER TABLE "measuring_tools"
  DROP COLUMN IF EXISTS "gecontroleerd_door",
  DROP COLUMN IF EXISTS "gecontroleerd_door_id",
  DROP COLUMN IF EXISTS "gecontroleerd_jaar",
  DROP COLUMN IF EXISTS "gecontroleerd_week";
