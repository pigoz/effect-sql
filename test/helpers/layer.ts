import { pipe } from "@effect/data/Function";
import * as Effect from "@effect/io/Effect";
import * as Layer from "@effect/io/Layer";
import { PostgreSqlContainer } from "testcontainers";
import { Pool } from "pg";
import { globSync } from "glob";
import * as path from "path";
import * as fs from "fs";
import {
  DrizzlePgConnection,
  DrizzlePgConnectionPool,
} from "effect-drizzle/pg";

export type TestLayer = DrizzlePgConnection;

const DrizzlePgConnectionTest = Layer.effect(
  DrizzlePgConnection,
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

      return new DrizzlePgConnectionPool(pool);
    })
  )
);

export const testLayer: Layer.Layer<never, never, TestLayer> = pipe(
  DrizzlePgConnectionTest
);

export async function getPostgreSqlContainerUri() {}
