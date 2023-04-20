// Kysely
import * as schema from "./pg.schema";

import { queryBuilderDsl, InferDatabase } from "effect-sql/builders/kysely/pg";

import { Selectable } from "kysely";

export const db = queryBuilderDsl({
  schema,
  options: { useCamelCaseTransformer: true },
});

interface Database extends InferDatabase<typeof db> {}

export interface City extends Selectable<Database["cities"]> {}
export interface User extends Selectable<Database["users"]> {}
