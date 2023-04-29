import {
  PostgresAdapter,
  PostgresQueryCompiler,
  PostgresIntrospector,
  KyselyConfig,
  DummyDriver,
} from "kysely";

import { KyselyEffect } from "effect-sql/builders/kysely";
type Config = Omit<KyselyConfig, "dialect">;

export function queryBuilderDsl<Database>(config?: Config) {
  return new KyselyEffect<Database>({
    ...config,
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
      createDriver: () => new DummyDriver(),
    },
  });
}
