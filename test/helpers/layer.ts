import { pipe } from "@effect/data/Function";
import * as Effect from "@effect/io/Effect";
import * as Layer from "@effect/io/Layer";
import { PostgreSqlContainer } from "testcontainers";
import { Pool } from "pg";
import * as path from "path";
import { PgConnection, PgConnectionPool, migrate } from "effect-drizzle/pg";

const DrizzlePgConnectionTest = Layer.effect(
  PgConnection,
  pipe(
    Effect.promise(async () => {
      const container = await new PostgreSqlContainer()
        .withUsername("postgres")
        .withPassword("postgres")
        .withDatabase("effect_drizzle_test")
        .withReuse()
        .start();

      const connectionString =
        container.getConnectionUri() + "?sslmode=disable";

      const pool = new Pool({ connectionString });

      return new PgConnectionPool(pool);
    })
  )
);

const DrizzlePgMigration = Layer.effectDiscard(
  migrate(path.resolve(__dirname, "../migrations/pg"))
);

export type TestLayer = PgConnection;

export const testLayer: Layer.Layer<never, never, TestLayer> = pipe(
  DrizzlePgConnectionTest,
  Layer.provideMerge(DrizzlePgMigration)
);
