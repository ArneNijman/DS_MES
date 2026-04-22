CREATE TABLE "machines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"machine_id" text,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"manufacturer" text,
	"model" text,
	"serial_number" text,
	"year_of_purchase" integer,
	"weight_kg" numeric(10, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"electric_kva" numeric(8, 2),
	"electric_kw" numeric(8, 2),
	"electric_ampere" numeric(8, 2),
	"electric_fuse" text,
	"electric_cable_length" numeric(8, 2),
	"electric_wire_diameter" text,
	"cnc_controller" text,
	"cnc_ip_address" text,
	"cnc_cam_name" text,
	"cnc_max_tools" integer,
	"cnc_max_length" numeric(10, 2),
	"cnc_max_diameter" numeric(10, 2),
	"cnc_spindle_interface" text,
	"cnc_nc_version" text,
	"cnc_plc_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "machines_machine_id_unique" UNIQUE("machine_id")
);
--> statement-breakpoint
CREATE TABLE "maintenance_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"machine_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'gepland' NOT NULL,
	"priority" text DEFAULT 'normaal' NOT NULL,
	"scheduled_date" text,
	"completed_date" text,
	"assigned_to_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "breakdowns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"machine_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'gemeld' NOT NULL,
	"priority" text DEFAULT 'normaal' NOT NULL,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reported_by_id" uuid,
	"resolved_at" timestamp with time zone,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_assigned_to_id_employees_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "breakdowns" ADD CONSTRAINT "breakdowns_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "breakdowns" ADD CONSTRAINT "breakdowns_reported_by_id_employees_id_fk" FOREIGN KEY ("reported_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;
