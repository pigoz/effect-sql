import { pipe } from "@effect/data/Function";
import * as Effect from "@effect/io/Effect";
import * as Layer from "@effect/io/Layer";
import * as Option from "@effect/data/Option";
import { PostgreSqlContainer } from "testcontainers";
import * as path from "path";
import { PgConnection, PgConnectionPoolScopedService } from "effect-drizzle/pg";
import { PgMigrationError } from "effect-drizzle/errors";
import * as Config from "@effect/io/Config";
import * as ConfigSecret from "@effect/io/Config/Secret";
import * as ConfigError from "@effect/io/Config/Error";
import { PgMigrationLayer } from "effect-drizzle/pg/schema";

export const testContainer = pipe(
  Effect.promise(async () => {
    const container = await new PostgreSqlContainer()
      .withUsername("postgres")
      .withPassword("postgres")
      .withDatabase("effect_drizzle_test")
      .withReuse()
      .start();

    return container.getConnectionUri() + "?sslmode=disable";
  }),
  Effect.map((uri) =>
    Config.succeed({
      databaseUrl: ConfigSecret.fromString(uri),
      databaseName: Option.none(),
    })
  )
);

export type TestLayer = PgConnection;

export const testLayer: Layer.Layer<
  never,
  PgMigrationError | ConfigError.ConfigError,
  TestLayer
> = pipe(
  Layer.scoped(
    PgConnection,
    Effect.flatMap(testContainer, PgConnectionPoolScopedService)
  ),
  Layer.provideMerge(
    PgMigrationLayer(path.resolve(__dirname, "../migrations/pg"))
  )
);
