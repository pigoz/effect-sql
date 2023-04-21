import {
  PostgresAdapter,
  PostgresQueryCompiler,
  PostgresIntrospector,
} from "kysely";

import {
  QueryBuilderDsl,
  QueryBuilderConfig,
} from "effect-sql/builders/kysely";

export function queryBuilderDsl<Database>(options: QueryBuilderConfig) {
  return new QueryBuilderDsl<Database>({
    createAdapter: () => new PostgresAdapter(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
    ...options,
  });
}
