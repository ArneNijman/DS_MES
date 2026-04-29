CREATE TABLE "product_setup_overdracht" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "step_id"    uuid NOT NULL REFERENCES "product_setup_steps"("id") ON DELETE CASCADE,
  "tekst"      text NOT NULL,
  "created_by" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_by_name" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "product_setup_overdracht_step_id_idx" ON "product_setup_overdracht"("step_id");
CREATE INDEX "product_setup_overdracht_created_at_idx" ON "product_setup_overdracht"("created_at" DESC);
