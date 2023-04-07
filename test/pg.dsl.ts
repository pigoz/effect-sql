import { InferDatabase, createQueryDsl } from "effect-drizzle/pg/schema";
import * as schema from "./pg.schema";
import { Selectable } from "kysely";

interface Database extends InferDatabase<typeof schema> {}
export const db = createQueryDsl<Database>();

export interface City extends Selectable<Database["cities"]> {}
export interface User extends Selectable<Database["users"]> {}
