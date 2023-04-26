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
import * as TaggedScope from "effect-sql/TaggedScope";
import { DatabaseError, NotFound, TooMany } from "effect-sql/errors";

// General types
export type UnknownRow = {
  [x: string]: unknown;
};

export interface QueryResult<T = UnknownRow> {
  rowCount?: bigint;
  rows: T[];
}

// Hooks
export interface AfterQueryHook extends Data.Case {
  _tag: "AfterQueryHook";
  hook: (res: QueryResult) => QueryResult;
}

export const AfterQueryHook = Context.Tag<AfterQueryHook>(
  Symbol.for("pigoz/effect-sql/AfterQueryHook")
);

export const afterQueryHook = Data.tagged<AfterQueryHook>("AfterQueryHook");

// Connection Pool Types
export interface Client<A = unknown> extends Data.Case {
  _tag: "Client";
  native: A;
  savepoint: number;
}

const Client = Context.Tag<Client>(Symbol.for("pigoz/effect-sql/Client"));

export interface ConnectionScope extends Data.Case {
  _tag: "ConnectionScope";
}

export const ConnectionScope = TaggedScope.Tag<ConnectionScope>(
  Symbol.for("pigoz/effect-sql/ConnectionScope")
);

export const ClientService = Data.tagged<Client>("Client");

export interface ConnectionPool extends Data.Case {
  _tag: "ConnectionPool";
  driver: Driver<Client>;
  pool: Pool.Pool<DatabaseError, Client>;
}

export const ConnectionPool = Context.Tag<ConnectionPool>(
  Symbol.for("pigoz/effect-sql/ConnectionPool")
);

const ConnectionPoolService = Data.tagged<ConnectionPool>("ConnectionPool");

// Driver
export interface IsolationLevel extends Data.Case {
  _tag: "IsolationLevel";
  sql: string;
}

export const IsolationLevel = Context.Tag<IsolationLevel>(
  Symbol.for("pigoz/effect-sql/IsolationLevel")
);

export const IsolationLevelService = (sql: string) =>
  Data.tagged<IsolationLevel>("IsolationLevel")({ sql });

export const ReadUncommitted = IsolationLevelService("read uncommitted");
export const ReadCommitted = IsolationLevelService("read committed");
export const RepeatableRead = IsolationLevelService("repeatable read");
export const Serializable = IsolationLevelService("serializable");

type DriverQuery = Effect.Effect<ConnectionPool, DatabaseError, QueryResult>;

export interface Driver<C extends Client = Client> {
  // builds / destroys a client to insert into the pool
  connect(connectionString: string): Effect.Effect<never, DatabaseError, C>;
  disconnect(client: C): Effect.Effect<never, DatabaseError, void>;

  // acquires / releases a client to the pool
  acquire(client: C): Effect.Effect<Scope.Scope, DatabaseError, C>;
  release(client: C): Effect.Effect<never, DatabaseError, void>;

  scoped(
    x: Effect.Effect<ConnectionScope, DatabaseError, C>
  ): Effect.Effect<ConnectionScope, DatabaseError, C>;

  runQuery(
    client: C,
    sql: string,
    params: readonly unknown[]
  ): Effect.Effect<never, DatabaseError, QueryResult>;

  // Remove dependency on ConnectionPool and pass C to match other Driver
  // funtions
  start: {
    savepoint(name: string): DriverQuery;
    transaction(): DriverQuery;
  };

  rollback: {
    savepoint(name: string): DriverQuery;
    transaction(): DriverQuery;
  };

  commit: {
    savepoint(name: string): DriverQuery;
    transaction(): DriverQuery;
  };

  sandbox(driver: Driver<C>): Effect.Effect<never, never, SandboxedDriver<C>>;
}

export interface SandboxedDriver<C extends Client = Client> extends Driver<C> {
  unsandbox(): Effect.Effect<never, never, void>;
}

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
  driver: Driver<Client>,
  config_: Partial<DatabaseConfig>
): Effect.Effect<Scope.Scope, ConfigError, ConnectionPool> {
  const { ...config } = config_;
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
      driver.connect(connectionString),
      (client) => Effect.orDie(driver.disconnect(client))
    );

    return Pool.makeWithTTL(get, 1, 20, Duration.seconds(60));
  };

  return pipe(
    getConnectionString,
    Effect.flatMap(createConnectionPool),
    Effect.map((pool) => ConnectionPoolService({ pool, driver }))
  );
}

export function connect(
  onExistingMapper: (client: Client) => Client = identity
) {
  return Effect.flatMap(ConnectionPool, (service) =>
    service.driver.scoped(
      Effect.contextWithEffect((r: Context.Context<never>) =>
        Option.match(
          Context.getOption(r, Client),
          () =>
            pipe(
              Effect.acquireRelease(
                Effect.flatMap(Pool.get(service.pool), service.driver.acquire),
                (client) => Effect.orDie(service.driver.release(client))
              ),
              TaggedScope.tag(ConnectionScope)
            ),
          (client) => Effect.succeed(onExistingMapper(client))
        )
      )
    )
  );
}

export function connected<R, E, A>(
  self: Effect.Effect<R | Client, E, A>
): Effect.Effect<Exclude<R, Client> | ConnectionPool, DatabaseError | E, A> {
  return pipe(
    connect(),
    Effect.flatMap((client) => Effect.provideService(self, Client, client)),
    TaggedScope.scoped(ConnectionScope)
  );
}

export function runQuery<A = UnknownRow>(
  sql: string,
  parameters?: readonly unknown[]
): Effect.Effect<ConnectionPool, DatabaseError, QueryResult<A>> {
  return pipe(
    Effect.all({ client: Client, pool: ConnectionPool }),
    Effect.flatMap(({ client, pool }) =>
      pool.driver.runQuery(client, sql, parameters ?? [])
    ),
    connected,
    Effect.flatMap((result) =>
      Effect.match(
        Effect.contextWithEffect((context: Context.Context<never>) =>
          Context.getOption(context, AfterQueryHook)
        ),
        () => result,
        (service) => service.hook(result)
      )
    ),
    Effect.map((x) => x as any)
  );
}

export function runQueryOne<A>(
  sql: string,
  parameters?: readonly unknown[]
): Effect.Effect<ConnectionPool, DatabaseError | NotFound, A> {
  return pipe(
    runQuery<A>(sql, parameters),
    Effect.flatMap((result) =>
      pipe(
        REA.head(result.rows),
        Either.fromOption(
          () => new NotFound({ sql, parameters: parameters ?? [] })
        )
      )
    )
  );
}

export function runQueryExactlyOne<A>(
  sql: string,
  parameters?: readonly unknown[]
): Effect.Effect<ConnectionPool, DatabaseError | NotFound | TooMany, A> {
  return pipe(
    runQuery<A>(sql, parameters),
    Effect.flatMap(
      Effect.unifiedFn((result) => {
        const [head, ...rest] = result.rows;

        if (rest.length > 0) {
          return Effect.fail(
            new TooMany({ sql, parameters: parameters ?? [] })
          );
        }

        return pipe(
          head,
          Either.fromNullable(
            () => new NotFound({ sql, parameters: parameters ?? [] })
          )
        );
      })
    )
  );
}

const matchSavepoint = (
  fn: (driver: Driver) => {
    savepoint: (name: string) => DriverQuery;
    transaction: () => DriverQuery;
  }
) =>
  Effect.flatMap(
    Effect.all({ client: Client, pool: ConnectionPool }),
    ({ client, pool }) => {
      const implementation = fn(pool.driver);
      return client.savepoint > 0
        ? implementation.savepoint(`savepoint_${client.savepoint}`)
        : implementation.transaction();
    }
  );

export function transaction<R, E1, A>(self: Effect.Effect<R, E1, A>) {
  const start = matchSavepoint((driver) => driver.start);
  const rollback = matchSavepoint((driver) => driver.rollback);
  const commit = matchSavepoint((driver) => driver.commit);

  const bumpSavepoint = (c: Client) =>
    ClientService({ ...c, savepoint: c.savepoint + 1 });

  const acquire = pipe(
    connect(bumpSavepoint),
    Effect.flatMap((client) =>
      Effect.zipRight(
        Effect.provideService(start, Client, client),
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
        () => commit
      ),
      Effect.orDie, // XXX handle error when rolling back?
      Effect.provideService(Client, client)
    );

  return TaggedScope.scoped(
    Effect.acquireUseRelease(acquire, use, release),
    ConnectionScope
  );
}

export function sandbox<R, E, A>(
  self: Effect.Effect<R, E, A>
): Effect.Effect<ConnectionPool | R, E, A> {
  return Effect.flatMap(ConnectionPool, (pool) =>
    Effect.acquireUseRelease(
      pool.driver.sandbox(pool.driver),
      (driver) =>
        Effect.provideService(self, ConnectionPool, { ...pool, driver }),
      (driver) => driver.unsandbox()
    )
  );
}
