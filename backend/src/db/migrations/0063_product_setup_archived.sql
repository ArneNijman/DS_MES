ALTER TABLE "product_setups"
  ADD COLUMN "archived_at" TIMESTAMP WITH TIME ZONE,
  ADD COLUMN "archived_order_status" TEXT;
