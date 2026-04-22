CREATE TABLE "tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "description" text,
  "priority" text NOT NULL DEFAULT 'laag',
  "due_date" text,
  "status" text NOT NULL DEFAULT 'open',
  "is_favorite" boolean NOT NULL DEFAULT false,
  "machine_id" uuid REFERENCES "machines"("id") ON DELETE SET NULL,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "assigned_to_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "assigned_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "assignment_status" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
