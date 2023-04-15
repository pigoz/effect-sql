import { pipe } from "@effect/data/Function";
import * as Effect from "@effect/io/Effect";
import * as Layer from "@effect/io/Layer";
import { PostgreSqlContainer } from "testcontainers";
import * as path from "path";
import { ConnectionPool, ConnectionPoolScopedService } from "effect-sql/pg";
import { MigrationError, DatabaseError } from "effect-sql/errors";
import * as Config from "@effect/io/Config";
import * as ConfigSecret from "@effect/io/Config/Secret";
import * as ConfigError from "@effect/io/Config/Error";
import { PgMigrationLayer } from "effect-sql/pg/schema";
import { db } from "../pg.dsl";

export const testContainer = pipe(
  Effect.promise(async () => {
    const container = await new PostgreSqlContainer()
      .withUsername("postgres")
      .withPassword("postgres")
      .withDatabase("effect_drizzle_test")
      .withReuse()
      .start();

    return container.getConnectionUri() + "?sslmode=disable";
  })
);

export type TestLayer = ConnectionPool;

export const testLayer: Layer.Layer<
  never,
  DatabaseError | MigrationError | ConfigError.ConfigError,
  TestLayer
> = pipe(
  Layer.scoped(
    ConnectionPool,
    Effect.flatMap(testContainer, (uri) =>
      ConnectionPoolScopedService({
        databaseUrl: Config.succeed(ConfigSecret.fromString(uri)),
        transformer: db,
      })
    )
  ),
  Layer.provideMerge(
    PgMigrationLayer(path.resolve(__dirname, "../migrations/pg"))
  )
);
