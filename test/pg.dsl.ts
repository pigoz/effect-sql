import * as schema from "./pg.schema";
import { Selectable } from "kysely";

import { InferDatabase } from "effect-sql/query";
import { queryBuilderDsl } from "effect-sql/pg/schema";

export const db = queryBuilderDsl(schema, { useCamelCaseTransformer: true });
interface Database extends InferDatabase<typeof db> {}

export interface City extends Selectable<Database["cities"]> {}
export interface User extends Selectable<Database["users"]> {}
