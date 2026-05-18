CREATE TABLE "role_module_permissions" (
  "role"       text NOT NULL,
  "module_key" text NOT NULL,
  PRIMARY KEY ("role", "module_key")
);
