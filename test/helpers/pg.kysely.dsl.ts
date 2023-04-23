import * as schema from "./pg.schema";

import { queryBuilderDsl } from "effect-sql/builders/kysely/pg";
import { InferDatabase, CamelCase } from "effect-sql/schema/kysely";

import { Selectable } from "kysely";

interface Database extends CamelCase<InferDatabase<typeof schema>> {}
export const db = queryBuilderDsl<Database>({ useCamelCaseTransformer: true });

export interface City extends Selectable<Database["cities"]> {}
export interface User extends Selectable<Database["users"]> {}
