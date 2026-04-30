-- Maak article_name nullable (wordt niet langer gebruikt als verplicht veld)
ALTER TABLE "product_setups"
  ALTER COLUMN "article_name" DROP NOT NULL;
