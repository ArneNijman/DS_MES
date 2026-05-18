CREATE TABLE "status_logs" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entity_type"      text NOT NULL,
  "entity_id"        uuid NOT NULL,
  "from_status"      text,
  "to_status"        text NOT NULL,
  "changed_by_name"  text,
  "changed_by_id"    uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"       timestamp with time zone DEFAULT now() NOT NULL
);
