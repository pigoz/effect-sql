import * as Effect from "@effect/io/Effect";
import * as Context from "@effect/data/Context";

import {
  runQuery as runRawQuery,
  runQueryOne as runRawQueryOne,
  runQueryExactlyOne as runRawQueryExactlyOne,
  AfterQueryHook,
  afterQueryHook,
} from "effect-sql/query";

import { Kysely, QueryResult, Compilable, InferResult } from "kysely";
import { DatabaseError } from "effect-sql/errors";

const withBuilder = <R, E, A>(
  self: Effect.Effect<R, E, A>
): Effect.Effect<R | KyselyQueryBuilder, E, A> =>
  Effect.flatMap(KyselyQueryBuilder, (builder) =>
    Effect.provideService(
      self,
      AfterQueryHook,
      afterQueryHook({
        hook: (_) => builder.afterQueryHook(_),
      })
    )
  );

export function runQuery<
  C extends Compilable<unknown>,
  A extends InferResult<C>[number]
>(compilable: C) {
  const { sql, parameters } = compilable.compile();
  return withBuilder(runRawQuery<A>(sql, parameters));
}

export function runQueryRows<
  C extends Compilable<any>,
  A extends InferResult<C>[number]
>(compilable: C) {
  const { sql, parameters } = compilable.compile();
  return withBuilder(
    Effect.map(runRawQuery<A>(sql, parameters), (result) => result.rows)
  );
}

export function runQueryOne<
  C extends Compilable<unknown>,
  A extends InferResult<C>[number]
>(compilable: C) {
  const { sql, parameters } = compilable.compile();
  return withBuilder(runRawQueryOne<A>(sql, parameters));
}

export function runQueryExactlyOne<
  C extends Compilable<unknown>,
  A extends InferResult<C>[number]
>(compilable: C) {
  const { sql, parameters } = compilable.compile();
  return withBuilder(runRawQueryExactlyOne<A>(sql, parameters));
}

export interface KyselyQueryBuilder {
  readonly _: unique symbol;
}

export const KyselyQueryBuilder = Context.Tag<
  KyselyQueryBuilder,
  KyselyEffect<any>
>(Symbol.for("pigoz/effect-sql/KyselyQueryBuilder"));

export class KyselyEffect<Database> extends Kysely<Database> {
  afterQueryHook<X>(
    result: QueryResult<X>
  ): Effect.Effect<never, DatabaseError, QueryResult<X>> {
    return Effect.tryCatchPromise(
      () => this.transformResult(result),
      (err) =>
        new DatabaseError({
          message:
            err instanceof Error ? err.message : "generic afterQueryHook error",
        })
    );
  }

  async transformResult<T>(result: QueryResult<any>): Promise<QueryResult<T>> {
    const queryId = { queryId: "unsupported" };

    for (const plugin of this.getExecutor().plugins) {
      result = await plugin.transformResult({ result, queryId });
    }

    return result;
  }
}
