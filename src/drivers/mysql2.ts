import mysql2 from "mysql2";
import * as Effect from "@effect/io/Effect";
import * as Context from "@effect/data/Context";
import * as Option from "@effect/data/Option";
import { DatabaseError } from "effect-sql/errors";
import { pipe } from "@effect/data/Function";
import {
  Client,
  Driver,
  QueryResult,
  runQuery,
  ClientService,
  IsolationLevel,
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
      Effect.map((native) => ClientService({ native, savepoint: 0 }) as C)
    );

  const runQueryImpl = (
    client: C,
    sql: string,
    parameters: readonly unknown[]
  ) =>
    Effect.async<never, DatabaseError, QueryResult>((resume) => {
      client.native.query(
        sql,
        parameters,
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
    });

  const disconnect = (client: C) =>
    Effect.async<never, DatabaseError, void>((resume) =>
      client.native.end((error) => resume(ErrorFromMysql2(error)))
    );

  return {
    connect,
    runQuery: runQueryImpl,
    disconnect,

    start: {
      transaction: () =>
        Effect.contextWithEffect((r: Context.Context<never>) =>
          Option.match(
            Context.getOption(r, IsolationLevel),
            () => runQuery(`start transaction`),
            (isolation) =>
              runQuery(`start transaction isolation level ${isolation.sql}`)
          )
        ),
      savepoint: (name: string) => runQuery(`savepoint ${name}`),
    },

    rollback: {
      transaction: () => runQuery(`rollback`),
      savepoint: (name: string) => runQuery(`rollback to ${name}`),
    },

    commit: {
      transaction: () => runQuery(`commit`),
      savepoint: (name: string) => runQuery(`release savepoint ${name}`),
    },
  };
}

export function SandboxedDriver<C extends Client<mysql2.Connection>>(): Driver<C> {
  const driver = Driver<C>();
  driver.commit.transaction = driver.rollback.transaction;
  return driver;
}
