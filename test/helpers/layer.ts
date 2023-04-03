import { pipe } from "@effect/data/Function";
import * as Effect from "@effect/io/Effect";
import * as Layer from "@effect/io/Layer";
import { PostgreSqlContainer } from "testcontainers";
import * as path from "path";
import {
  PgConnection,
  PgConnectionPoolService,
  migrate,
} from "effect-drizzle/pg";
import { PgMigrationError } from "effect-drizzle/errors";
import * as Config from "@effect/io/Config";
import * as ConfigSecret from "@effect/io/Config/Secret";
import * as ConfigError from "@effect/io/Config/Error";

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
    })
  )
);

const PgMigration = Layer.effectDiscard(
  migrate(path.resolve(__dirname, "../migrations/pg"))
);

export type TestLayer = PgConnection;

export const testLayer: Layer.Layer<
  never,
  PgMigrationError | ConfigError.ConfigError,
  TestLayer
> = Layer.provideMerge(
  Layer.effect(
    PgConnection,
    Effect.flatMap(testContainer, PgConnectionPoolService)
  ),
  PgMigration
);
