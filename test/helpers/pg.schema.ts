import {
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "effect-sql/schema/pg";

export const role = pgEnum("role", ["admin", "user"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  full_name: text("full_name").notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  role: text("role").default("user").notNull(),
  city_id: integer("city_id").references(() => cities.id),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const visits = pgTable("visits", {
  id: serial("id").primaryKey(),
  value: integer("value").notNull(),
  city_id: integer("city_id")
    .references(() => cities.id)
    .notNull(),
  user_id: integer("user_id")
    .references(() => users.id)
    .notNull(),
});

export const cities = pgTable("cities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});
