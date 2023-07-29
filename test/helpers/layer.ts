import { pipe } from "@effect/data/Function";
import * as Effect from "@effect/io/Effect";
import * as Layer from "@effect/io/Layer";
import * as Runtime from "@effect/io/Runtime";
import * as Scope from "@effect/io/Scope";
import * as Exit from "@effect/io/Exit";
import * as Context from "@effect/data/Context";

import { PostgreSqlContainer } from "testcontainers";
import * as path from "path";
import {
  ConnectionPool,
  ConnectionPoolScopedService,
  Driver,
} from "effect-sql/query";
import * as Config from "@effect/io/Config";
import * as ConfigSecret from "@effect/io/Config/Secret";
import { MigrationLayer } from "effect-sql/schema/pg";

import { afterAll, beforeAll } from "vitest";
import { DatabaseError, MigrationError } from "effect-sql/errors";
import { ConfigError } from "@effect/io/Config/Error";
import { PostgreSqlSandboxedDriver } from "effect-sql/drivers/pg";
import { KyselyQueryBuilder } from "effect-sql/builders/kysely";

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

export const testLayer = pipe(
  Layer.succeed(Driver, PostgreSqlSandboxedDriver()),
  Layer.provideMerge(
    Layer.scoped(
      ConnectionPool,
      Effect.flatMap(testContainer, (uri) =>
        ConnectionPoolScopedService({
          databaseUrl: Config.succeed(ConfigSecret.fromString(uri)),
        })
      )
    )
  ),
  Layer.provideMerge(
    MigrationLayer(path.resolve(__dirname, "../migrations/pg"))
  )
);

export type TestLayer = ConnectionPool | Driver | KyselyQueryBuilder;

const makeRuntime = <R, E, A>(layer: Layer.Layer<R, E, A>) =>
  Effect.gen(function* ($) {
    const scope = yield* $(Scope.make());
    const ctx: Context.Context<A> = yield* $(
      Layer.buildWithScope(scope)(layer)
    );

    const runtime = yield* $(Effect.provideContext(Effect.runtime<A>(), ctx));

    return {
      runtime,
      close: Scope.close(scope, Exit.unit),
    };
  });

export function runTestPromise<R extends TestLayer, E, A>(
  self: Effect.Effect<R, E, A>
) {
  const r = (globalThis as any).runtime as Runtime.Runtime<TestLayer>;
  return Runtime.runPromise(r)(self);
}

const TIMEOUT = 30000;

export function usingLayer(
  layer: Layer.Layer<
    never,
    DatabaseError | ConfigError | MigrationError,
    ConnectionPool
  >
) {
  beforeAll(
    async () =>
      Effect.runPromise(makeRuntime(layer)).then(({ runtime, close }) => {
        (globalThis as any).runtime = runtime;
        (globalThis as any).close = close;
      }),
    TIMEOUT
  );

  afterAll(async () => Effect.runPromise((globalThis as any).close), TIMEOUT);
}
