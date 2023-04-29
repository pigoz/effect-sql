import * as Effect from "@effect/io/Effect";
import * as Context from "@effect/data/Context";
import * as Option from "@effect/data/Option";
import { DatabaseError } from "effect-sql/errors";
import pg from "pg";
import { pipe } from "@effect/data/Function";
import {
  Client,
  Driver,
  QueryResult,
  ClientService,
  IsolationLevel,
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

export function PostgreSqlDriver<C extends Client<pg.Client>>(): Driver<C> {
  const connect = (connectionString: string) =>
    pipe(
      Effect.sync(() => new pg.Client({ connectionString })),
      Effect.tap((client) =>
        Effect.async<never, DatabaseError, void>((resume) =>
          client.connect((error) => resume(ErrorFromPg(error)))
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
    _tag: "Driver",
    connect,
    runQuery: runQueryImpl,
    disconnect,

    start: {
      transaction: (client) =>
        Effect.contextWithEffect((r: Context.Context<never>) =>
          Option.match(
            Context.getOption(r, IsolationLevel),
            () => runQueryImpl(client, `start transaction`, []),
            (isolation) =>
              runQueryImpl(
                client,
                `start transaction isolation level ${isolation.sql}`,
                []
              )
          )
        ),
      savepoint: (client, name) =>
        runQueryImpl(client, `savepoint ${name}`, []),
    },

    rollback: {
      transaction: (client) => runQueryImpl(client, `rollback`, []),
      savepoint: (client, name) =>
        runQueryImpl(client, `rollback to ${name}`, []),
    },

    commit: {
      transaction: (client) => runQueryImpl(client, `commit`, []),
      savepoint: (client, name) =>
        runQueryImpl(client, `release savepoint ${name}`, []),
    },
  };
}

export function PostgreSqlSandboxedDriver<
  C extends Client<pg.Client>
>(): Driver<C> {
  const driver = PostgreSqlDriver<C>();
  driver.commit.transaction = driver.rollback.transaction;
  return driver;
}
