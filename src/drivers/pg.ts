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

interface PostgreSqlClient extends Client {
  native: pg.Client;
}

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

export function PostgreSqlDriver<C extends PostgreSqlClient>(): Driver<C> {
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

  const disconnect = (client: C) =>
    Effect.async<never, DatabaseError, void>((resume) =>
      client.native.end((error) => resume(ErrorFromPg(error)))
    );

  const acquire = (client: C) =>
    Effect.zipRight(Effect.logTrace(`checkout`), Effect.succeed(client));

  const release = (client: C) =>
    Effect.zipRight(Effect.logTrace(`release`), Effect.succeed(client));

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

  const start = {
    transaction: (client: C) =>
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
    savepoint: (client: C, name: string) =>
      runQueryImpl(client, `savepoint ${name}`, []),
  };

  const rollback = {
    transaction: (client: C) => runQueryImpl(client, `rollback`, []),
    savepoint: (client: C, name: string) =>
      runQueryImpl(client, `rollback to ${name}`, []),
  };

  const commit = {
    transaction: (client: C) => runQueryImpl(client, `commit`, []),
    savepoint: (client: C, name: string) =>
      runQueryImpl(client, `release savepoint ${name}`, []),
  };

  const driver = {
    _tag: "Driver" as const,
    connect,
    disconnect,

    acquire,
    release,

    runQuery: runQueryImpl,

    start,
    rollback,
    commit,
  };

  const sandbox = (): Effect.Effect<never, never, Driver<C>> =>
    Effect.succeed({
      ...driver,
      acquire: (client) =>
        Effect.zipRight(
          start.transaction(client),
          Effect.succeed({ ...client, savepoint: 1 })
        ),
      release: (client) => Effect.orDie(rollback.transaction(client)),
      sandbox: () => Effect.die("already sandboxed"),
    });

  return {
    ...driver,
    sandbox,
  };
}

export function PostgreSqlSandboxedDriver2<
  C extends PostgreSqlClient
>(): Driver<C> {
  const driver = PostgreSqlDriver<C>();
  // driver.commit.transaction = driver.rollback.transaction;
  return driver;
}

export function PostgreSqlSandboxedDriver<
  C extends PostgreSqlClient
>(): Driver<C> {
  const driver = PostgreSqlDriver<C>();
  // driver.commit.transaction = driver.rollback.transaction;
  return driver;
}
