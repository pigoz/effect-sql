import { Table } from "drizzle-orm";
import { QueryBuilderConfig, QueryBuilderDsl } from "effect-sql/query/kysely";

import {
  PostgresAdapter,
  PostgresQueryCompiler,
  PostgresIntrospector,
} from "kysely";

export function queryBuilderDsl<
  T extends Record<string, Table>,
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
