import * as Effect from "@effect/io/Effect";
import * as Scope from "@effect/io/Scope";
import * as Exit from "@effect/io/Exit";
import * as Context from "@effect/data/Context";
import * as Option from "@effect/data/Option";
import { DatabaseError } from "effect-sql/errors";
import pg from "pg";
import { pipe } from "@effect/data/Function";
import {
  Client,
  Driver,
  SandboxedDriver,
  QueryResult,
  runQuery,
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

export function Driver<C extends Client<pg.Client>>(): Driver<C> {
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

  const start = {
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
  };

  const rollback = {
    transaction: () => runQuery(`rollback`),
    savepoint: (name: string) => runQuery(`rollback to ${name}`),
  };

  const commit = {
    transaction: () => runQuery(`commit`),
    savepoint: (name: string) => runQuery(`release savepoint ${name}`),
  };

  const sandboxed = (
    driver: Driver<C>,
    scope: Scope.CloseableScope,
    connectionString: string
  ) =>
    pipe(
      Effect.acquireRelease(
        Effect.flatMap(connect(connectionString), (client) =>
          Effect.zipRight(
            // TODO? use actual transaction code to honor isolation level
            runQueryImpl(client, "start transaction", []),
            Effect.succeed(client)
          )
        ),
        (client) =>
          pipe(
            Effect.zipRight(
              runQueryImpl(client, "rollback", []),
              driver.disconnect(client)
            ),
            Effect.orDie
          )
      ),
      Scope.extend(scope)
    );

  const sandbox = (
    driver: Driver<C>
  ): Effect.Effect<never, never, SandboxedDriver<C>> =>
    pipe(
      Scope.make(),
      Effect.map((scope) => ({
        ...driver,
        connect: (connectionString: string) =>
          sandboxed(driver, scope, connectionString),
        disconnect: () => Effect.unit(),
        unsandbox: () => Scope.close(scope, Exit.unit()),
      }))
    );

  return {
    connect,
    runQuery: runQueryImpl,
    disconnect,
    start,
    rollback,
    commit,
    sandbox,
  };
}
