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
import * as Effectx from "effect-sql/Effectx";
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
  hook: (res: QueryResult) => Effect.Effect<never, DatabaseError, QueryResult>;
}

export const AfterQueryHook = Context.Tag<AfterQueryHook>(
  Symbol.for("pigoz/effect-sql/AfterQueryHook")
);

export const afterQueryHook = Data.tagged<AfterQueryHook>("AfterQueryHook");

// Connection Pool Types
export interface Client extends Data.Case {
  _tag: "Client";
  native: unknown;
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

type DriverQuery = Effect.Effect<never, DatabaseError, QueryResult>;

export interface Driver<C extends Client = Client> {
  _tag: "Driver";

  connect(connectionString: string): Effect.Effect<never, DatabaseError, C>;
  disconnect(client: C): Effect.Effect<never, DatabaseError, void>;

  runQuery(client: C, sql: string, params: readonly unknown[]): DriverQuery;

  start: {
    savepoint(client: C, name: string): DriverQuery;
    transaction(client: C): DriverQuery;
  };

  rollback: {
    savepoint(client: C, name: string): DriverQuery;
    transaction(client: C): DriverQuery;
  };

  commit: {
    savepoint(client: C, name: string): DriverQuery;
    transaction(client: C): DriverQuery;
  };
}

export const Driver = Context.Tag<Driver>(
  Symbol.for("pigoz/effect-sql/Driver")
);

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
): Effect.Effect<Scope.Scope | Driver, ConfigError, ConnectionPool> {
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
    const get = Effect.flatMap(Driver, (driver) =>
      Effect.acquireRelease(driver.connect(connectionString), (client) =>
        Effect.orDie(driver.disconnect(client))
      )
    );

    return Pool.makeWithTTL(get, 1, 20, Duration.seconds(60));
  };

  return pipe(
    getConnectionString,
    Effect.flatMap(createConnectionPool),
    Effect.map((pool) => ConnectionPoolService({ pool }))
  );
}

export function connect(
  onExistingMapper: (client: Client) => Client = identity
) {
  return Effect.matchEffect(
    Effectx.optionalService(Client),
    () =>
      Effect.flatMap(ConnectionPool, (service) =>
        TaggedScope.tag(Pool.get(service.pool), ConnectionScope)
      ),
    (client) => Effect.succeed(onExistingMapper(client))
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
): Effect.Effect<ConnectionPool | Driver, DatabaseError, QueryResult<A>> {
  return pipe(
    Effect.all({ client: Client, driver: Driver }),
    Effect.flatMap(({ client, driver }) =>
      driver.runQuery(client, sql, parameters ?? [])
    ),
    connected,
    Effect.flatMap((result) =>
      Effect.matchEffect(
        Effectx.optionalService(AfterQueryHook),
        () => Effect.succeed(result),
        (service) => service.hook(result)
      )
    ),
    Effect.map((x) => x as QueryResult<A>)
  );
}

export function runQueryOne<A>(
  sql: string,
  parameters?: readonly unknown[]
): Effect.Effect<ConnectionPool | Driver, DatabaseError | NotFound, A> {
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
): Effect.Effect<
  ConnectionPool | Driver,
  DatabaseError | NotFound | TooMany,
  A
> {
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
    savepoint: (client: Client, name: string) => DriverQuery;
    transaction: (client: Client) => DriverQuery;
  }
) =>
  Effect.flatMap(
    Effect.all({ client: Client, driver: Driver }),
    ({ client, driver }) => {
      const implementation = fn(driver);
      return client.savepoint > 0
        ? implementation.savepoint(client, `savepoint_${client.savepoint}`)
        : implementation.transaction(client);
    }
  );

export function transaction<R, E1, A>(
  self: Effect.Effect<R, E1, A>
): Effect.Effect<
  ConnectionPool | Driver | Exclude<Exclude<R, Client>, ConnectionScope>,
  DatabaseError | E1,
  A
> {
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
