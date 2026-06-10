CREATE TABLE IF NOT EXISTS "kalibratie_verzendingen" (
  "id"                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "naam"                  TEXT NOT NULL,
  "status"                TEXT NOT NULL DEFAULT 'concept',
  "datum_weggestuurd"     TEXT,
  "datum_terug"           TEXT,
  "lab_naam"              TEXT,
  "aangemaakt_door_id"    UUID REFERENCES employees(id) ON DELETE SET NULL,
  "aangemaakt_door_naam"  TEXT,
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "kalibratie_verzending_items" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "verzending_id" UUID NOT NULL REFERENCES kalibratie_verzendingen(id) ON DELETE CASCADE,
  "tool_id"       UUID NOT NULL REFERENCES measuring_tools(id) ON DELETE CASCADE,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
