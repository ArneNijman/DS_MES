DROP TABLE IF EXISTS "maintenance_logs";

CREATE TABLE "maintenance_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"maintenance_task_id" uuid NOT NULL,
	"type" text NOT NULL,
	"registered_by_name" text NOT NULL,
	"registered_by_id" text,
	"year" integer NOT NULL,
	"week_number" integer NOT NULL,
	"spindle_hours" numeric(10, 2),
	"las_value_a" text,
	"las_value_b" text,
	"bijgevuld" boolean,
	"vervangen" boolean,
	"afvoer_geleegd" boolean,
	"percentage" text,
	"file_url" text,
	"file_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_logs_task_id_fk" FOREIGN KEY ("maintenance_task_id") REFERENCES "public"."maintenance_tasks"("id") ON DELETE CASCADE ON UPDATE no action
);
