import { pipe } from "@effect/data/Function";
import * as Layer from "@effect/io/Layer";
import * as Effect from "@effect/io/Effect";

import { PgConnection } from "effect-sql/pg";
import { PgMigrationError } from "effect-sql/errors";

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
  return Layer.effectDiscard(migrate(path));
}

export function migrate(migrationsFolder: string) {
  return pipe(
    PgConnection,
    Effect.tap((conn) =>
      Effect.tryCatchPromise(
        () => {
          const client = drizzle(conn.queryable);
          return dmigrate(client, { migrationsFolder });
        },
        (error) => new PgMigrationError({ error })
      )
    )
  );
}
