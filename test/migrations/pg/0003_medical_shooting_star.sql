ALTER TABLE "cities" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;
ALTER TABLE "cities" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;