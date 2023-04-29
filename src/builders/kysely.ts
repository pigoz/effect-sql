import * as Effect from "@effect/io/Effect";
import * as Context from "@effect/data/Context";

import {
  runQuery as runRawQuery,
  runQueryOne as runRawQueryOne,
  runQueryExactlyOne as runRawQueryExactlyOne,
} from "effect-sql/query";

import { Kysely, QueryResult, Compilable, InferResult } from "kysely";
import { DatabaseError } from "effect-sql/errors";
import { pipe } from "@effect/data/Function";

export function runQuery<
  C extends Compilable<unknown>,
  A extends InferResult<C>[number]
>(compilable: C) {
  const { sql, parameters } = compilable.compile();
  return Effect.flatMap(KyselyQueryBuilder, (builder) =>
    pipe(
      runRawQuery<A>(sql, parameters),
      Effect.flatMap((_) => builder.afterQueryHook(_))
    )
  );
}

export function runQueryRows<
  C extends Compilable<any>,
  A extends InferResult<C>[number]
>(compilable: C) {
  return Effect.map(runQuery<C, A>(compilable), (result) => result.rows);
}

export function runQueryOne<
  C extends Compilable<unknown>,
  A extends InferResult<C>[number]
>(compilable: C) {
  const { sql, parameters } = compilable.compile();
  return Effect.flatMap(KyselyQueryBuilder, (builder) =>
    pipe(
      runRawQueryOne<A>(sql, parameters),
      Effect.flatMap((_) => builder.afterQueryHookOne(_))
    )
  );
}

export function runQueryExactlyOne<
  C extends Compilable<unknown>,
  A extends InferResult<C>[number]
>(compilable: C) {
  const { sql, parameters } = compilable.compile();
  return Effect.flatMap(KyselyQueryBuilder, (builder) =>
    pipe(
      runRawQueryExactlyOne<A>(sql, parameters),
      Effect.flatMap((_) => builder.afterQueryHookOne(_))
    )
  );
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
      () => this.#transformResult(result),
      (err) => this.#databaseError(err)
    );
  }

  afterQueryHookOne<X>(result: X): Effect.Effect<never, DatabaseError, X> {
    return pipe(
      Effect.tryCatchPromise(
        () => this.#transformResult<X>({ rows: [result] }),
        (err) => this.#databaseError(err)
      ),
      Effect.map((x) => x.rows[0]!)
    );
  }

  #databaseError(err: unknown) {
    return new DatabaseError({
      message:
        err instanceof Error ? err.message : "generic afterQueryHook error",
    });
  }

  async #transformResult<T>(result: QueryResult<any>): Promise<QueryResult<T>> {
    // XXX figure out a way to get to the proper queryId
    const queryId = { queryId: "unsupported" };

    for (const plugin of this.getExecutor().plugins) {
      result = await plugin.transformResult({ result, queryId });
    }

    return result;
  }
}
