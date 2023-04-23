import * as Effect from "@effect/io/Effect";
import { DatabaseError } from "effect-sql/errors";
import pg from "pg";
import { pipe } from "@effect/data/Function";
import {
  Client,
  Driver,
  QueryResult,
  runQuery,
  makeClient,
} from "effect-sql/query";

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

  const runQueryImpl = (
    client: C,
    sql: string,
    parameters: readonly unknown[]
  ) =>
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
    });

  const disconnect = (client: C) =>
    Effect.async<never, DatabaseError, void>((resume) =>
      client.native.end((error) => resume(ErrorFromPg(error)))
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

export function SandboxedDriver<C extends Client<pg.Client>>(): Driver<C> {
  const driver = Driver<C>();
  driver.commit.transaction = driver.rollback.transaction;
  return driver;
}
