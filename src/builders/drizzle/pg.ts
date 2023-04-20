import { NodePgDatabase, drizzle } from "drizzle-orm/node-postgres/driver.js";
import { TransformResultSync } from "effect-sql/builders/core";

type Dsl = NodePgDatabase & TransformResultSync;

export function queryBuilderDsl(): Dsl {
  return drizzle(Symbol.for("postgres-stub") as any) as Dsl;
}
