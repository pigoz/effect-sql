import * as Effect from "@effect/io/Effect";
import { DatabaseError } from "effect-sql/errors";
import pg from "pg";
import { pipe } from "@effect/data/Function";
import { Client, Driver, QueryResult, makeClient } from "effect-sql/query";

const ErrorFromPg = (error?: Error) =>
  error
    ? Effect.fail(
        new DatabaseError({
          name: "ConnectionPoolError",
          message: error.message,
        })
      )
    : Effect.unit();

function QueryResultFromPg<A>(result: pg.QueryResult): QueryResult<A> {
  return {
    rowCount: result.rowCount === null ? undefined : BigInt(result.rowCount),
    rows: result.rows ?? [],
  };
}

export function Driver<C extends Client<pg.Client>>(): Driver<C> {
  const connect = (connectionString: string) =>
    pipe(
      Effect.sync(() => new pg.Client({ connectionString })),
      Effect.tap((client) =>
        Effect.async<never, DatabaseError, void>((resume) =>
          client.connect((error) => resume(ErrorFromPg(error)))
        )
      ),
      Effect.map((native) => makeClient({ native, savepoint: 0 }) as C)
    );

  const runQuery = (client: C, sql: string, parameters: readonly unknown[]) =>
    pipe(
      Effect.async<never, DatabaseError, QueryResult>((resume) => {
        client.native.query(
          { text: sql, values: parameters?.slice(0) },
          (error: pg.DatabaseError, result: pg.QueryResult) => {
            if (error) {
              resume(
                Effect.fail(
                  new DatabaseError({
                    code: error.code,
                    name: "QueryError",
                    message: error.message,
                  })
                )
              );
            } else {
              resume(Effect.succeed(QueryResultFromPg(result)));
            }
          }
        );
      })
    );

  const disconnect = (client: C) =>
    pipe(
      Effect.async<never, DatabaseError, void>((resume) =>
        client.native.end((error) => resume(ErrorFromPg(error)))
      ),
      Effect.orDie
    );

  return {
    connect,
    runQuery,
    disconnect,
  };
}
