import { NodePgDatabase, drizzle } from "drizzle-orm/node-postgres/driver.js";
import { QueryResult, TransformResultSync } from "effect-sql/query";
import { UnknownRow } from "kysely";

type Dsl = NodePgDatabase & TransformResultSync;

export function queryBuilderDsl(): Dsl {
  const db = drizzle(Symbol.for("postgres-stub") as any) as Dsl;
  db.transformResultSync = (_: QueryResult<UnknownRow>) => _;
  return db;
}
