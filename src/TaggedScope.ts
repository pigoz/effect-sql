import { dual } from "@effect/data/Function";
import * as Scope from "@effect/io/Scope";
import * as Effect from "@effect/io/Effect";
import * as Context from "@effect/data/Context";
import * as Effectx from "effect-sql/Effectx";

Context.Tag;

export const Tag = <I>(key?: unknown) =>
  Context.Tag<I, I & { scope: Scope.CloseableScope }>(key);

interface Tag<I> extends Context.Tag<I, I & { scope: Scope.CloseableScope }> {}

export const scoped = dual<
  <I, R, E, A>(
    tag: Tag<I>,
    init: I
  ) => (self: Effect.Effect<R, E, A>) => Effect.Effect<Exclude<R, I>, E, A>,
  <I, R, E, A>(
    self: Effect.Effect<R, E, A>,
    tag: Tag<I>,
    init: I
  ) => Effect.Effect<Exclude<R, I>, E, A>
>(3, (self, tag, init) =>
  Effect.matchEffect(
    Effectx.optionalService(tag),
    () =>
      Effect.acquireUseRelease(
        Scope.make(),
        (scope) => Effect.provideService(self, tag, { ...init, scope }),
        (scope, exit) => Scope.close(scope, exit)
      ),
    (scope) => Effect.provideService(self, tag, scope)
  )
);

export const tag = dual<
  <I, R, E, A>(
    tag: Tag<I>
  ) => (
    self: Effect.Effect<R, E, A>
  ) => Effect.Effect<Exclude<R, Scope.Scope> | I, E, A>,
  <I, R, E, A>(
    self: Effect.Effect<R, E, A>,
    tag: Tag<I>
  ) => Effect.Effect<Exclude<R, Scope.Scope> | I, E, A>
>(2, (self, tag) =>
  Effect.flatMap(tag, (scope) => Scope.extend(scope.scope)(self))
);
