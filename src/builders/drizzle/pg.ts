import { NodePgDatabase, drizzle } from "drizzle-orm/node-postgres/driver.js";
import { TransformResultSync } from "effect-sql/builders/core";
import { QueryResult } from "effect-sql/query";

type Dsl = NodePgDatabase & TransformResultSync;

export function queryBuilderDsl(): Dsl {
  const db = drizzle(Symbol.for("postgres-stub") as any) as Dsl;
  db.transformResultSync = (_: QueryResult) => _;
  return db;
}
