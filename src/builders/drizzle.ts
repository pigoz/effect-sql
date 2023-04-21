import * as Effect from "@effect/io/Effect";

import {
  runQuery as runRawQuery,
  runQueryOne as runRawQueryOne,
  runQueryExactlyOne as runRawQueryExactlyOne,
} from "effect-sql/query";

interface Compilable<O> extends Promise<O> {
  toSQL(): { sql: string; params: unknown[] };
}

type InferResult<A extends Compilable<any>> = Awaited<A>;

export function runQuery<
  C extends Compilable<unknown>,
  A extends InferResult<C>
>(compilable: C) {
  const { sql, params } = compilable.toSQL();
  return runRawQuery<A>(sql, params);
}

export function runQueryRows<
  C extends Compilable<unknown>,
  A extends InferResult<C>
>(compilable: C) {
  const { sql, params } = compilable.toSQL();
  return Effect.map(runRawQuery<A>(sql, params), (result) => result.rows);
}

export function runQueryOne<
  C extends Compilable<unknown>,
  A extends InferResult<C> extends (infer X)[] ? X : never
>(compilable: C) {
  const { sql, params } = compilable.toSQL();
  return runRawQueryOne<A>(sql, params);
}

export function runQueryExactlyOne<
  C extends Compilable<unknown>,
  A extends InferResult<C> extends (infer X)[] ? X : never
>(compilable: C) {
  const { sql, params } = compilable.toSQL();
  return runRawQueryExactlyOne<A>(sql, params);
}
