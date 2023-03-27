import * as V from "vitest";

import { pipe } from "@effect/data/Function";
import * as Effect from "@effect/io/Effect";
import { testLayer, TestLayer } from "./layer";
import { transaction } from "effect-drizzle/pg";

export type API = V.TestAPI<{}>;

const TestEnvironment = testLayer;
type TestEnvironment = TestLayer;

const it: API = V.it;

export const effect = (() => {
  const f = <E, A>(
    name: string,
    self: () => Effect.Effect<TestEnvironment, E, A>,
    timeout = 5_000
  ) => {
    return it(
      name,
      () =>
        pipe(
          Effect.suspend(self),
          Effect.provideLayer(TestEnvironment),
          // Effect.tapErrorCause(_ => Effect.logErrorCauseMessage('effect', _)),
          Effect.runPromise
        ),
      timeout
    );
  };
  return Object.assign(f, {
    skip: <E, A>(
      name: string,
      self: () => Effect.Effect<TestEnvironment, E, A>,
      timeout = 5_000
    ) => {
      return it.skip(
        name,
        () =>
          pipe(
            Effect.suspend(self),
            Effect.provideLayer(TestEnvironment),
            Effect.runPromise
          ),
        timeout
      );
    },
  });
})();

export const pgtransaction = (() => {
  const f = <E, A>(
    name: string,
    self: () => Effect.Effect<TestEnvironment, E, A>,
    timeout = 5_000
  ) => {
    return it(
      name,
      () =>
        pipe(
          Effect.suspend(() => transaction(self, { test: true })),
          Effect.provideLayer(TestEnvironment),
          Effect.runPromise
        ),
      timeout
    );
  };
  return Object.assign(f, {
    skip: <E, A>(
      name: string,
      self: () => Effect.Effect<TestEnvironment, E, A>,
      timeout = 5_000
    ) => {
      return it.skip(
        name,
        () =>
          pipe(
            transaction(() => Effect.suspend(self), { test: true }),
            Effect.provideLayer(TestEnvironment),
            Effect.runPromise
          ),
        timeout
      );
    },
  });
})();
