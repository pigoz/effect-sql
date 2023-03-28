import * as Effect from "@effect/io/Effect";
import { TestLayer, testLayer } from "./layer";
import { afterAll, beforeAll } from "vitest";
import * as Runtime from "@effect/io/Runtime";
import * as Scope from "@effect/io/Scope";
import * as Exit from "@effect/io/Exit";
import * as Context from "@effect/data/Context";
import * as Layer from "@effect/io/Layer";

const makeRuntime = <R, E, A>(layer: Layer.Layer<R, E, A>) =>
  Effect.gen(function* ($) {
    const scope = yield* $(Scope.make());
    const ctx: Context.Context<A> = yield* $(
      Layer.buildWithScope(scope)(layer)
    );

    const runtime = yield* $(Effect.provideContext(Effect.runtime<A>(), ctx));

    return {
      runtime,
      close: Scope.close(scope, Exit.unit()),
    };
  });

export function runTestPromise<R extends TestLayer, E, A>(
  self: Effect.Effect<R, E, A>
) {
  const r = (globalThis as any).runtime as Runtime.Runtime<TestLayer>;
  return Runtime.runPromise(r)(self);
}

const TIMEOUT = 30000;

beforeAll(
  async () =>
    Effect.runPromise(makeRuntime(testLayer)).then(({ runtime, close }) => {
      (globalThis as any).runtime = runtime;
      (globalThis as any).close = close;
    }),
  TIMEOUT
);

afterAll(async () => Effect.runPromise((globalThis as any).close), TIMEOUT);
