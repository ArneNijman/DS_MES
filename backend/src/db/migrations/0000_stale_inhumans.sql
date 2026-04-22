CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "bc_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text NOT NULL,
	"base_url" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_tested_at" timestamp with time zone,
	"last_test_result" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bc_field_map" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"logical_field" text NOT NULL,
	"detected_variant" text NOT NULL,
	"example_value" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bc_field_map_entity_field_unique" UNIQUE("entity_type","logical_field")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bc_id" text,
	"name" text NOT NULL,
	"email" text,
	"photo_url" text,
	"is_clocked_in" boolean DEFAULT false NOT NULL,
	"clocked_in_at" timestamp with time zone,
	"pin_hash" text,
	"role" text DEFAULT 'employee' NOT NULL,
	"bc_data" jsonb,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_bc_id_unique" UNIQUE("bc_id")
);
--> statement-breakpoint
CREATE TABLE "smtp_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"host" text NOT NULL,
	"port" text NOT NULL,
	"user" text NOT NULL,
	"password" text NOT NULL,
	"from" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
