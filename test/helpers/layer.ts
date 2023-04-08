import { pipe } from "@effect/data/Function";
import * as Effect from "@effect/io/Effect";
import * as Layer from "@effect/io/Layer";
import { PostgreSqlContainer } from "testcontainers";
import * as path from "path";
import { PgConnection, PgConnectionPoolScopedService } from "effect-sql/pg";
import { PgMigrationError } from "effect-sql/errors";
import * as Config from "@effect/io/Config";
import * as ConfigSecret from "@effect/io/Config/Secret";
import * as ConfigError from "@effect/io/Config/Error";
import { PgMigrationLayer } from "effect-sql/pg/schema";
import { QueryBuilder } from "effect-sql/query";
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

export type TestLayer = PgConnection | QueryBuilder;

export const testLayer: Layer.Layer<
  never,
  PgMigrationError | ConfigError.ConfigError,
  TestLayer
> = pipe(
  Layer.scoped(
    PgConnection,
    Effect.flatMap(testContainer, (uri) =>
      PgConnectionPoolScopedService({
        databaseUrl: Config.succeed(ConfigSecret.fromString(uri)),
      })
    )
  ),
  Layer.provideMerge(Layer.succeed(QueryBuilder, db)),
  Layer.provideMerge(
    PgMigrationLayer(path.resolve(__dirname, "../migrations/pg"))
  )
);
