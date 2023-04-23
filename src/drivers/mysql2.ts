import mysql2 from "mysql2";
import * as Effect from "@effect/io/Effect";
import { pipe } from "@effect/data/Function";
import { DatabaseError } from "effect-sql/errors";

import {
  type Client,
  type Driver,
  type QueryResult,
  runQuery,
  makeClient,
} from "effect-sql/query";

const ErrorFromMysql2 = (error: mysql2.QueryError | null) =>
  error
    ? Effect.fail(
        new DatabaseError({
          name: "ConnectionPoolError",
          message: error.message,
        })
      )
    : Effect.unit();

function QueryResultFromMysql2<A>(
  result: mysql2.RowDataPacket[]
): QueryResult<A> {
  return {
    rowCount: BigInt(result.length),
    // rowCount: result.rowCount === null ? undefined : BigInt(result.rowCount),
    rows: result as any[],
  };
}

export function Driver<C extends Client<mysql2.Connection>>(): Driver<C> {
  const connect = (connectionString: string) =>
    pipe(
      Effect.sync(() => mysql2.createConnection(connectionString)),
      Effect.tap((client) =>
        Effect.async<never, DatabaseError, void>((resume) =>
          client.connect((error) => resume(ErrorFromMysql2(error)))
        )
      ),
      Effect.map((native) => makeClient({ native, savepoint: 0 }) as C)
    );

  const runQueryImpl = (client: C, sql: string, values: readonly unknown[]) =>
    pipe(
      Effect.async<never, DatabaseError, QueryResult>((resume) => {
        client.native.query(
          sql,
          values,
          (error, result: mysql2.RowDataPacket[]) => {
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
              resume(Effect.succeed(QueryResultFromMysql2(result)));
            }
          }
        );
      })
    );

  const disconnect = (client: C) =>
    pipe(
      Effect.async<never, DatabaseError, void>((resume) =>
        client.native.end((error) => resume(ErrorFromMysql2(error)))
      ),
      Effect.orDie
    );

  return {
    connect,
    runQuery: runQueryImpl,
    disconnect,

    start: {
      transaction: () => runQuery(`START TRANSACTION`),
      savepoint: (name: string) => runQuery(`SAVEPOINT ${name}`),
    },

    rollback: {
      transaction: () => runQuery(`ROLLBACK`),
      savepoint: (name: string) => runQuery(`ROLLBACK TO ${name}`),
    },

    commit: {
      transaction: () => runQuery(`COMMIT`),
      savepoint: (name: string) => runQuery(`RELEASE SAVEPOINT ${name}`),
    },
  };
}
