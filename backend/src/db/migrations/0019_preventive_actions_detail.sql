ALTER TABLE preventive_actions
  ADD COLUMN completed_at text,
  ADD COLUMN resultaat text,
  ADD COLUMN production_order text,
  ADD COLUMN item_ref text,
  ADD COLUMN item_name text,
  ADD COLUMN created_by_name text,
  ADD COLUMN stilstand_registreren boolean DEFAULT false;
