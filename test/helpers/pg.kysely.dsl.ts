import * as schema from "./pg.schema";

import { queryBuilderDsl } from "effect-sql/builders/kysely/pg";
import { InferDatabase, CamelCaseDatabase } from "effect-sql/schema/kysely";

import { CamelCasePlugin, Selectable } from "kysely";

interface Database extends CamelCaseDatabase<InferDatabase<typeof schema>> {}

export const db = queryBuilderDsl<Database>({
  plugins: [new CamelCasePlugin()],
});

export interface City extends Selectable<Database["cities"]> {}
export interface User extends Selectable<Database["users"]> {}
