import * as V from "vitest";
import * as Effect from "@effect/io/Effect";
import { TestLayer, runTestPromise } from "./layer";
import { transaction } from "effect-sql/query";

export type API = V.TestAPI<{}>;

const it: API = V.it;

export const effect = (() => {
  const f = <E, A>(
    name: string,
    self: () => Effect.Effect<TestLayer, E, A>,
    timeout = 5_000
  ) => {
    return it(name, () => runTestPromise(Effect.suspend(self)), timeout);
  };
  return Object.assign(f, {
    skip: <E, A>(
      name: string,
      self: () => Effect.Effect<TestLayer, E, A>,
      timeout = 5_000
    ) => {
      return it.skip(name, () => runTestPromise(Effect.suspend(self)), timeout);
    },
  });
})();

export const sandbox = (() => {
  const f = <E, A>(
    name: string,
    self: () => Effect.Effect<TestLayer, E, A>,
    timeout = 5_000
  ) => {
    return it(
      name,
      () => runTestPromise(transaction(Effect.suspend(self))),
      timeout
    );
  };
  return Object.assign(f, {
    skip: <E, A>(
      name: string,
      self: () => Effect.Effect<TestLayer, E, A>,
      timeout = 5_000
    ) => {
      return it.skip(
        name,
        () => runTestPromise(transaction(Effect.suspend(self))),
        timeout
      );
    },
    only: <E, A>(
      name: string,
      self: () => Effect.Effect<TestLayer, E, A>,
      timeout = 5_000
    ) => {
      return it.only(
        name,
        () => runTestPromise(transaction(Effect.suspend(self))),
        timeout
      );
    },
    fails: <E, A>(
      name: string,
      self: () => Effect.Effect<TestLayer, E, A>,
      timeout = 5_000
    ) => {
      return it.fails(
        name,
        () => runTestPromise(transaction(Effect.suspend(self))),
        timeout
      );
    },
  });
})();
