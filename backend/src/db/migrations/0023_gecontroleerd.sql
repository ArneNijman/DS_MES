ALTER TABLE "measuring_tools"
  ADD COLUMN "gecontroleerd_door"     text,
  ADD COLUMN "gecontroleerd_door_id"  uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  ADD COLUMN "gecontroleerd_jaar"     integer,
  ADD COLUMN "gecontroleerd_week"     integer;
