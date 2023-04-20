// XXX can I remove the dependency on these?
import { Compiled, QueryResult } from "effect-sql/query";
import {
  Compilable as KyselyCompilable,
  InferResult as KyselyInferResult,
} from "kysely";

interface DrizzleCompilable<O> extends Promise<O> {
  toSQL(): { sql: string; params: unknown[] };
}

type DrizzleInferResult<A extends DrizzleCompilable<any>> = Awaited<A>;

// XXX Compilable and Result must be made agnostic to builders and moved to /query.ts
export type Compilable<O> = KyselyCompilable<O> | DrizzleCompilable<O>;

export type InferResult<X extends Compilable<any>> =
  X extends KyselyCompilable<any>
    ? KyselyInferResult<X>
    : X extends DrizzleCompilable<any>
    ? DrizzleInferResult<X>
    : never;

export function compile<O>(compilable: Compilable<O>): Compiled {
  if ("toSQL" in compilable) {
    // Drizzle
    const compiled = compilable.toSQL();
    return { sql: compiled.sql, parameters: compiled.params };
  } else {
    const compiled = compilable.compile();
    return { sql: compiled.sql, parameters: compiled.parameters };
  }
}

export interface TransformResultSync {
  transformResultSync(result: QueryResult): QueryResult;
}
