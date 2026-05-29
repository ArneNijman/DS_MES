CREATE TABLE "product_setup_maten" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "setup_id"        uuid NOT NULL REFERENCES "product_setups"("id") ON DELETE CASCADE,
  "balloon_nr"      integer NOT NULL,
  "kenmerk"         text NOT NULL DEFAULT '',
  "nominaal"        text NOT NULL DEFAULT '',
  "tolerantie"      text,
  "omschrijving"    text,
  "gemeten_waarde"  text,
  "status"          text,
  "gemeten_door"    uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "gemeten_op"      timestamp with time zone,
  "aangemaakt_door" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "sort_order"      integer NOT NULL DEFAULT 0,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX ON "product_setup_maten"("setup_id", "sort_order");
