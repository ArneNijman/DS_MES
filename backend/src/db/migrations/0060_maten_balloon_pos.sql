ALTER TABLE product_setup_maten
  ADD COLUMN IF NOT EXISTS x_pct          real,
  ADD COLUMN IF NOT EXISTS y_pct          real,
  ADD COLUMN IF NOT EXISTS pagina_nummer  integer,
  ADD COLUMN IF NOT EXISTS drawing_doc_id uuid REFERENCES product_setup_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tol_plus       text,
  ADD COLUMN IF NOT EXISTS tol_min        text,
  ADD COLUMN IF NOT EXISTS balloon_type   text DEFAULT 'dimensional',
  ADD COLUMN IF NOT EXISTS meetmiddel     text,
  ADD COLUMN IF NOT EXISTS gdt_type       text;

ALTER TABLE product_setups
  ADD COLUMN IF NOT EXISTS maten_niveau text NOT NULL DEFAULT 'stap';
