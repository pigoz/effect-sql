import { pipe } from "@effect/data/Function";
import * as Effect from "@effect/io/Effect";
import * as Layer from "@effect/io/Layer";
import { PostgreSqlContainer } from "testcontainers";
import { Pool } from "pg";
import { globSync } from "glob";
import * as path from "path";
import * as fs from "fs";
import { PgConnection, PgConnectionPool } from "effect-drizzle/pg";

export type TestLayer = PgConnection;

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

      const migrations = globSync(
        path.join(path.dirname(__dirname), "migrations/pg/*.sql")
      );

      const sql = migrations
        .map((migration) => fs.readFileSync(migration, "utf8"))
        .join("\n");

      await pool.query(sql);

      return new PgConnectionPool(pool);
    })
  )
);

export const testLayer: Layer.Layer<never, never, TestLayer> = pipe(
  DrizzlePgConnectionTest
);
