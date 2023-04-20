import * as Effect from "@effect/io/Effect";
import { DatabaseError } from "effect-sql/errors";
import { QueryResult, UnknownRow } from "effect-sql/query";

export interface Driver<NativeClient> {
  connect(): Effect.Effect<never, never, NativeClient>;
  runQuery(
    client: NativeClient,
    sql: string,
    params: unknown[]
  ): Effect.Effect<never, DatabaseError, QueryResult<UnknownRow>>;
}
