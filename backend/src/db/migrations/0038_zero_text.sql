ALTER TABLE "product_setup_steps"
  ALTER COLUMN "zero_x" TYPE text USING zero_x::text,
  ALTER COLUMN "zero_y" TYPE text USING zero_y::text,
  ALTER COLUMN "zero_z" TYPE text USING zero_z::text;
