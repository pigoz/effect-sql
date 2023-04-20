import {
  PostgresAdapter,
  PostgresQueryCompiler,
  PostgresIntrospector,
} from "kysely";

import {
  QueryBuilderDsl,
  QueryBuilderConfig,
} from "effect-sql/builders/kysely";

export { InferDatabase } from "effect-sql/builders/kysely";

export function queryBuilderDsl<
  T extends Record<string, unknown>,
  O extends QueryBuilderConfig
>({ schema, options }: { schema: T; options: O }) {
  return new QueryBuilderDsl({
    schema,
    createAdapter: () => new PostgresAdapter(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
    ...options,
  });
}
