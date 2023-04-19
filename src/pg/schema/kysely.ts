import { QueryBuilderConfig, QueryBuilderDsl } from "effect-sql/query/kysely";

import {
  PostgresAdapter,
  PostgresQueryCompiler,
  PostgresIntrospector,
} from "kysely";

export type { InferDatabase } from "effect-sql/query/kysely";

export function queryBuilderDsl<
  T extends Record<string, unknown>,
  O extends QueryBuilderConfig
>(schema: T, options: O) {
  return new QueryBuilderDsl({
    schema,
    createAdapter: () => new PostgresAdapter(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
    ...options,
  });
}
