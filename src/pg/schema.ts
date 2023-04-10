import { pipe } from "@effect/data/Function";
import * as Layer from "@effect/io/Layer";
import * as Effect from "@effect/io/Effect";

import { connect } from "effect-sql/pg";
import { MigrationError } from "effect-sql/errors";

import { drizzle } from "drizzle-orm/node-postgres/driver.js";
import { migrate as dmigrate } from "drizzle-orm/node-postgres/migrator.js";

import {
  PostgresAdapter,
  PostgresQueryCompiler,
  PostgresIntrospector,
} from "kysely";

import type { Table } from "drizzle-orm/table";
import { QueryBuilderConfig, QueryBuilderDsl } from "effect-sql/query";
export * from "drizzle-orm/pg-core/index.js";

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

export function PgMigrationLayer(path: string) {
  return Layer.effectDiscard(Effect.scoped(migrate(path)));
}

export function migrate(migrationsFolder: string) {
  return pipe(
    connect(),
    Effect.flatMap((client) =>
      Effect.tryCatchPromise(
        () => {
          const d = drizzle(client.native);
          return dmigrate(d, { migrationsFolder });
        },
        (error) => new MigrationError({ error })
      )
    )
  );
}
