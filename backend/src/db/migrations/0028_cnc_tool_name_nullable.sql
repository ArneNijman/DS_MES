-- Maak name nullable zodat lege magazijnposities (unnamed tools) opgeslagen kunnen worden
ALTER TABLE "cnc_tool_entries" ALTER COLUMN "name" DROP NOT NULL;
