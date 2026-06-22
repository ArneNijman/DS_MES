ALTER TABLE tool_library_assemblies
  ADD COLUMN IF NOT EXISTS estimated_quantity integer;

ALTER TABLE tool_library_items
  ADD COLUMN IF NOT EXISTS estimated_quantity integer;
