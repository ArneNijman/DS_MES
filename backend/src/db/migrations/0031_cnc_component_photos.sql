ALTER TABLE "tool_library_items" ADD COLUMN "photo_url" text;
ALTER TABLE "tool_library_items"
  ADD CONSTRAINT "tool_library_items_source_item_unique"
  UNIQUE ("source_id", "item_type");
