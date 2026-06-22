ALTER TABLE machines ADD COLUMN IF NOT EXISTS postprocessors text[] NOT NULL DEFAULT '{}';
UPDATE machines SET postprocessors = ARRAY[postprocessor] WHERE postprocessor IS NOT NULL AND postprocessors = '{}';
ALTER TABLE machines DROP COLUMN IF EXISTS postprocessor;
