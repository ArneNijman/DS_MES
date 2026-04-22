CREATE TABLE "machine_service_visits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "machine_id" uuid NOT NULL,
  "visit_date" text NOT NULL,
  "service_type" text NOT NULL,
  "performed_by" text NOT NULL,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "service_visits_machine_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE CASCADE
);

CREATE TABLE "machine_service_contracts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "machine_id" uuid NOT NULL,
  "contract_number" text,
  "supplier" text NOT NULL,
  "start_date" text,
  "end_date" text,
  "cost_per_year" numeric(10,2),
  "description" text,
  "file_url" text,
  "file_name" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "service_contracts_machine_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE CASCADE
);
