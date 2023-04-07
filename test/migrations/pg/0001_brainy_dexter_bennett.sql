CREATE TABLE IF NOT EXISTS "visits" (
	"id" serial PRIMARY KEY NOT NULL,
	"value" integer NOT NULL,
	"city_id" integer NOT NULL,
	"user_id" integer NOT NULL
);

DO $$ BEGIN
 ALTER TABLE visits ADD CONSTRAINT visits_city_id_cities_id_fk FOREIGN KEY ("city_id") REFERENCES cities("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE visits ADD CONSTRAINT visits_user_id_users_id_fk FOREIGN KEY ("user_id") REFERENCES users("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
