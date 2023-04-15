// Kysely
import * as schema from "./pg.schema";
import { InferDatabase } from "effect-sql/query/kysely";
import { queryBuilderDsl } from "effect-sql/pg/schema/kysely";

import { Selectable } from "kysely";

export const db = queryBuilderDsl(schema, { useCamelCaseTransformer: true });
interface Database extends InferDatabase<typeof db> {}

export interface City extends Selectable<Database["cities"]> {}
export interface User extends Selectable<Database["users"]> {}
