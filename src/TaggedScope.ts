import { dual } from "@effect/data/Function";
import * as Scope from "@effect/io/Scope";
import * as Effect from "@effect/io/Effect";
import * as Context from "@effect/data/Context";

export const Tag = <Identifier>(key?: unknown) =>
  Context.Tag<Identifier, Scope.Scope.Closeable>(key);

interface Tag<Identifier>
  extends Context.Tag<Identifier, Scope.Scope.Closeable> {}

export const scoped = dual<
  <I, R, E, A>(
    tag: Tag<I>
  ) => (self: Effect.Effect<R, E, A>) => Effect.Effect<Exclude<R, I>, E, A>,
  <I, R, E, A>(
    self: Effect.Effect<R, E, A>,
    tag: Tag<I>
  ) => Effect.Effect<Exclude<R, I>, E, A>
>(2, (self, tag) =>
  Effect.acquireUseRelease(
    Scope.make(),
    (scope) => Effect.provideService(self, tag, scope),
    (scope, exit) => Scope.close(scope, exit)
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
>(2, (self, tag) => Effect.flatMap(tag, (scope) => Scope.extend(scope)(self)));
