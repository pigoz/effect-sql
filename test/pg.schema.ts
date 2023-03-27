import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "effect-drizzle/pg";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  role: text("role").default("user").notNull(),
  cityId: integer("city_id").references(() => cities.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const cities = pgTable("cities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
});
