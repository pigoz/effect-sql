import { InferDatabase, createDatabaseDsl } from "effect-sql/pg/schema";
import * as schema from "./pg.schema";
import { Selectable } from "kysely";

export const db = createDatabaseDsl(schema);
interface Database extends InferDatabase<typeof db> {}

export interface City extends Selectable<Database["cities"]> {}
export interface User extends Selectable<Database["users"]> {}
