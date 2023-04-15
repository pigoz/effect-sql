// Drizzle
import { InferModel } from "drizzle-orm";
import { queryBuilderDsl } from "effect-sql/pg/schema/drizzle";
import { cities, users } from "./pg.schema";

export const db = queryBuilderDsl();
export interface City extends InferModel<typeof cities> {}
export interface User extends InferModel<typeof users> {}
