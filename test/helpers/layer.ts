import { pipe } from "@effect/data/Function";
import * as Effect from "@effect/io/Effect";
import * as Layer from "@effect/io/Layer";
import { PostgreSqlContainer } from "testcontainers";
import { Pool } from "pg";
import * as path from "path";
import { PgConnection, PgConnectionPool, migrate } from "effect-drizzle/pg";
import { PgMigrationError } from "effect-drizzle/errors";
import * as Config from "@effect/io/Config";
import * as ConfigProvider from "@effect/io/Config/Provider";
import * as ConfigSecret from "@effect/io/Config/Secret";
import * as ConfigError from "@effect/io/Config/Error";

export const config = Config.all({
  DATABASE_URL: Config.secret(),
});

export const fromEnv = pipe(
  ConfigProvider.fromEnv().load(
    Config.all({
      DATABASE_URL: Config.secret(),
    })
  ),
  Effect.map((_) => _.DATABASE_URL),
  Effect.map(ConfigSecret.value)
);

export const fromTestContainer = pipe(
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

const PgConnectionTest = (
  config: Effect.Effect<never, ConfigError.ConfigError, string>
) =>
  Layer.effect(
    PgConnection,
    pipe(
      config,
      Effect.map((connectionString) => ({ connectionString })),
      Effect.map((config) => new PgConnectionPool(new Pool(config)))
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
> = Layer.provideMerge(PgConnectionTest(fromTestContainer), PgMigration);
