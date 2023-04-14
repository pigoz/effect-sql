import { identity, pipe } from "@effect/data/Function";
import * as Effect from "@effect/io/Effect";
import * as Data from "@effect/data/Data";
import * as Exit from "@effect/io/Exit";
import * as Context from "@effect/data/Context";
import * as Either from "@effect/data/Either";
import * as REA from "@effect/data/ReadonlyArray";
import * as Scope from "@effect/io/Scope";
import * as Option from "@effect/data/Option";
import * as Duration from "@effect/data/Duration";
import * as Config from "@effect/io/Config";
import * as ConfigSecret from "@effect/io/Config/Secret";
import * as Pool from "@effect/io/Pool";
import { ConfigError } from "@effect/io/Config/Error";

import { DatabaseError, NotFound, TooMany } from "effect-sql/errors";
import { Compilable, InferResult, QueryResult, UnknownRow } from "kysely";

import pg from "pg";
import { QueryBuilder } from "effect-sql/query";

interface Client extends Data.Case {
  _tag: "Client";
  native: pg.Client;
  savepoint: number;
}

const Client = Context.Tag<Client>(Symbol.for("pigoz/effect-sql/Client"));

const makeClient = Data.tagged<Client>("Client");

export interface ConnectionPool extends Data.Case {
  _tag: "ConnectionPool";
  pool: Pool.Pool<DatabaseError, Client>;
}

export const ConnectionPool = Context.Tag<ConnectionPool>(
  Symbol.for("pigoz/effect-sql/ConnectionPool")
);

const makeConnectionPool = Data.tagged<ConnectionPool>("ConnectionPool");

const defaultConfig = {
  databaseUrl: Config.secret("DATABASE_URL"),
  // overrides the one in the URL, useful to send out of bound commands like
  // drop database by connecting to i.e. template1
  databaseName: pipe(
    Config.string("DATABASE_NAME"),
    Config.optional,
    Config.withDefault(Option.none())
  ),
};

type DatabaseConfig = typeof defaultConfig;

export function ConnectionPoolScopedService(
  config: Partial<DatabaseConfig>
): Effect.Effect<Scope.Scope, ConfigError, ConnectionPool> {
  const getConnectionString = pipe(
    Effect.config(Config.all({ ...defaultConfig, ...config })),
    Effect.map(({ databaseUrl, databaseName }) =>
      Option.match(
        databaseName,
        () => ConfigSecret.value(databaseUrl),
        (databaseName) => {
          const uri = new URL(ConfigSecret.value(databaseUrl));
          uri.pathname = databaseName;
          return uri.toString();
        }
      )
    )
  );

  const createConnectionPool = (connectionString: string) => {
    const get = Effect.acquireRelease(
      pipe(
        Effect.sync(() => new pg.Client({ connectionString })),
        Effect.tap((client) =>
          Effect.tryCatchPromise(
            () => client.connect(),
            (error) =>
              new DatabaseError({
                name: (error as Error).name,
                message: (error as Error).message,
              })
          )
        ),
        Effect.map((native) => makeClient({ native, savepoint: 0 }))
      ),
      (client) =>
        pipe(
          Effect.tryCatchPromise(
            () => client.native.end(),
            (error) =>
              new DatabaseError({
                name: (error as Error).name,
                message: (error as Error).message,
              })
          ),
          Effect.orDie
        )
    );
    return Pool.makeWithTTL(get, 1, 20, Duration.seconds(60));
  };

  return pipe(
    getConnectionString,
    Effect.flatMap(createConnectionPool),
    Effect.map((pool) => makeConnectionPool({ pool }))
  );
}

export function connect(
  onExistingMapper: (client: Client) => Client = identity
) {
  return Effect.contextWithEffect((r: Context.Context<never>) =>
    Option.match(
      Context.getOption(r, Client),
      () => Effect.flatMap(ConnectionPool, (service) => Pool.get(service.pool)),
      (client) => Effect.succeed(onExistingMapper(client))
    )
  );
}

export function withClient<R, E, A>(
  self: Effect.Effect<R | Client, E, A>
): Effect.Effect<R | ConnectionPool | Scope.Scope, DatabaseError | E, A> {
  return Effect.flatMap(connect(), (client) =>
    Effect.provideService(Client, client)(self)
  );
}

export function runQuery<Builder extends Compilable<any>>(
  builder: Builder
): Effect.Effect<
  ConnectionPool | QueryBuilder | Scope.Scope,
  DatabaseError,
  InferResult<Builder>
> {
  const sql = builder.compile();
  return Effect.map(runRawQuery(sql.sql, sql.parameters), (_) => _.rows as any);
}

function builderToError<Builder extends Compilable<any>>(builder: Builder) {
  const compiled = builder.compile();
  return { sql: compiled.sql, parameters: compiled.parameters };
}

export function runQueryOne<
  Builder extends Compilable<any>,
  Element extends InferResult<Builder> extends (infer X)[] ? X : never
>(
  builder: Builder
): Effect.Effect<
  ConnectionPool | QueryBuilder | Scope.Scope,
  DatabaseError | NotFound,
  Element
> {
  return pipe(
    builder,
    runQuery,
    Effect.flatMap((x) => {
      return pipe(
        x as Element[],
        REA.head,
        Either.fromOption(() => new NotFound(builderToError(builder))),
        Effect.fromEither
      );
    })
  );
}

export function runQueryExactlyOne<
  Builder extends Compilable<any>,
  Element extends InferResult<Builder> extends (infer X)[] ? X : never
>(
  builder: Builder
): Effect.Effect<
  ConnectionPool | QueryBuilder | Scope.Scope,
  DatabaseError | NotFound | TooMany,
  Element
> {
  return pipe(
    builder,
    runQuery,
    Effect.flatMap(
      Effect.unified((x) => {
        const [head, ...rest] = x as Element[];

        if (rest.length > 0) {
          return Effect.fail(new TooMany(builderToError(builder)));
        }

        return pipe(
          head,
          Either.fromNullable(() => new NotFound(builderToError(builder))),
          Effect.fromEither
        );
      })
    )
  );
}

function QueryResultFromPg<O>(result: pg.QueryResult): QueryResult<O> {
  if (
    result.command === "INSERT" ||
    result.command === "UPDATE" ||
    result.command === "DELETE"
  ) {
    const numAffectedRows = BigInt(result.rowCount);

    return {
      // TODO: remove.
      numUpdatedOrDeletedRows: numAffectedRows,
      numAffectedRows,
      rows: result.rows ?? [],
    };
  }

  return {
    rows: result.rows ?? [],
  };
}

export function runRawQuery(sql: string, parameters?: readonly unknown[]) {
  return pipe(
    Effect.all([Client, QueryBuilder]),
    Effect.flatMap(([client, builder]) =>
      pipe(
        Effect.async<never, DatabaseError, QueryResult<UnknownRow>>(
          (resume) => {
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
          }
        ),
        Effect.map((result) => builder.transformResultSync(result))
      )
    ),
    withClient
  );
}

const matchSavepoint = <R1, R2, E1, E2, A1, A2>(
  onPositive: (name: string) => Effect.Effect<R1, E1, A1>,
  onZero: () => Effect.Effect<R2, E2, A2>
): Effect.Effect<Client | R1 | R2, E1 | E2, A1 | A2> =>
  Effect.flatMap(
    Client,
    Effect.unified((client) =>
      client.savepoint > 0
        ? onPositive(`savepoint_${client.savepoint}`)
        : onZero()
    )
  );

export function transaction<R, E1, A>(
  self: Effect.Effect<R, E1, A>,
  options?: { test?: boolean }
) {
  const start = matchSavepoint(
    (name) => runRawQuery(`SAVEPOINT ${name}`),
    () => runRawQuery(`START TRANSACTION`)
  );

  const rollback = matchSavepoint(
    (name) => runRawQuery(`ROLLBACK TO ${name}`),
    () => runRawQuery(`ROLLBACK`)
  );

  const commit = matchSavepoint(
    (name) => runRawQuery(`RELEASE SAVEPOINT ${name}`),
    () => runRawQuery(`COMMIT`)
  );

  const bumpSavepoint = (c: Client) =>
    makeClient({ ...c, savepoint: c.savepoint + 1 });

  const acquire = pipe(
    connect(bumpSavepoint),
    Effect.flatMap((client) =>
      Effect.zipRight(
        Effect.provideService(Client, client)(start),
        Effect.succeed(client)
      )
    )
  );

  const use = (client: Client) => Effect.provideService(Client, client)(self);

  const release = <E, A>(client: Client, exit: Exit.Exit<E, A>) =>
    pipe(
      exit,
      Exit.match(
        () => rollback,
        () => (options?.test ? rollback : commit)
      ),
      Effect.orDie, // XXX handle error when rolling back?
      Effect.provideService(Client, client)
    );

  return Effect.acquireUseRelease(acquire, use, release);
}
