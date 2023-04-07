import { pipe } from "@effect/data/Function";
import * as Layer from "@effect/io/Layer";
import * as Effect from "@effect/io/Effect";

import { PgConnection } from ".";

import { drizzle } from "drizzle-orm/node-postgres/driver.js";
import { migrate as dmigrate } from "drizzle-orm/node-postgres/migrator.js";
import { PgMigrationError } from "effect-sql/errors";

import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresQueryCompiler,
  PostgresIntrospector,
} from "kysely";

import { Kyselify } from "drizzle-orm/kysely";
import type { Table } from "drizzle-orm/table";
export * from "drizzle-orm/pg-core/index.js";

export type InferTable<T extends Table> = Kyselify<T>;

export type InferDatabase<T extends Record<string, Table>> = {
  [K in keyof T]: InferTable<T[K]>;
};

type CamelCase<S extends string> =
  S extends `${infer P1}_${infer P2}${infer P3}`
    ? `${Lowercase<P1>}${Uppercase<P2>}${CamelCase<P3>}`
    : Lowercase<S>;

export type KeysToCamelCase<T> = {
  [K in keyof T as CamelCase<string & K>]: T[K] extends {}
    ? KeysToCamelCase<T[K]>
    : T[K];
};

export function createQueryDsl<Database>() {
  return new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    // plugins: [new CamelCasePlugin()],
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
