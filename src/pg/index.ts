import { pipe } from "@effect/data/Function";
import * as Effect from "@effect/io/Effect";
import * as Data from "@effect/data/Data";
import * as Match from "@effect/match";
import * as Exit from "@effect/io/Exit";
import * as Context from "@effect/data/Context";
import * as Either from "@effect/data/Either";
import * as REA from "@effect/data/ReadonlyArray";
import * as Scope from "@effect/io/Scope";
import * as Option from "@effect/data/Option";
import * as Config from "@effect/io/Config";
import * as ConfigSecret from "@effect/io/Config/Secret";
import { ConfigError } from "@effect/io/Config/Error";

import { PgError, NotFound, TooMany } from "effect-sql/errors";
import { CamelCasePlugin, Compilable, InferResult } from "kysely";
import pg from "pg";

/*
 * Drizzle implements Lazy Promises in it's query builder interface.
 * As long as execute() or then() isn't called, this will not hit the database.
 */
const pgConnectionPoolConfig = Config.all({
  databaseUrl: Config.secret("DATABASE_URL"),
  // overrides the one in the URL, useful to send out of bound commands like
  // drop database by connecting to i.e. template1
  databaseName: Config.optional(Config.string("DATABASE_NAME")),
});

type PgConnectionPoolConfig = typeof pgConnectionPoolConfig;

export interface PgConnectionPool extends Data.Case {
  readonly _tag: "PgConnectionPool";
  readonly queryable: pg.Pool;
}

interface PgConnectionPoolClient extends Data.Case {
  readonly _tag: "PgConnectionPoolClient";
  readonly queryable: pg.PoolClient;
  readonly savepoint: number;
}

const PgConnectionPoolClientService = Data.tagged<PgConnectionPoolClient>(
  "PgConnectionPoolClient"
);

export type PgConnection = PgConnectionPool | PgConnectionPoolClient;

export const PgConnection = Context.Tag<PgConnection>("PgConnection");

export function PgConnectionPoolScopedService(
  config: PgConnectionPoolConfig = pgConnectionPoolConfig
): Effect.Effect<Scope.Scope, ConfigError, PgConnectionPool> {
  const acquire = Effect.map(
    Effect.config(config),
    ({ databaseUrl, databaseName }) => {
      const connectionString = pipe(
        Option.match(
          databaseName,
          () => databaseUrl,
          (databaseName) => {
            const uri = new URL(ConfigSecret.value(databaseUrl));
            uri.pathname = databaseName;
            return ConfigSecret.fromString(uri.toString());
          }
        ),
        ConfigSecret.value
      );

      const pool = new pg.Pool({ connectionString });

      // don't let a pg restart kill your app
      // XXX hook into effect logging
      pool.on("error", (err) => console.error(err));

      return Data.case<PgConnectionPool>()({
        _tag: "PgConnectionPool",
        queryable: pool,
      });
    }
  );

  const release = (pool: PgConnectionPool) =>
    Effect.async<never, never, void>((resume) =>
      pool.queryable.end(() => resume(Effect.unit()))
    );

  return Effect.acquireRelease(acquire, release);
}

export function connect<R, E1, A>(self: Effect.Effect<R, E1, A>) {
  const acquire: Effect.Effect<PgConnection, never, PgConnectionPoolClient> =
    pipe(
      PgConnection,
      Effect.flatMap(
        pipe(
          Match.type<PgConnection>(),
          Match.tag("PgConnectionPool", (_) =>
            pipe(
              Effect.promise(() => _.queryable.connect()),
              Effect.map((queryable) =>
                PgConnectionPoolClientService({ queryable, savepoint: 0 })
              )
            )
          ),
          Match.tag("PgConnectionPoolClient", (_) => Effect.succeed(_)),
          Match.exhaustive
        )
      )
    );

  const injectPoolClient = (_: PgConnection) =>
    Effect.updateService(PgConnection, () => _);

  const use = (conn: PgConnection) => pipe(self, injectPoolClient(conn));

  const release = <E, A>(conn: PgConnectionPoolClient, exit: Exit.Exit<E, A>) =>
    pipe(
      exit,
      Exit.match(
        () => Effect.unit(),
        () => Effect.sync(conn.queryable.release)
      ),
      injectPoolClient(conn)
    );

  return Effect.acquireUseRelease(acquire, use, release);
}

export function runQuery<Builder extends Compilable<any>>(
  builder: Builder
): Effect.Effect<PgConnection, PgError, InferResult<Builder>> {
  const sql = builder.compile();
  return Effect.map(runRawQuery(sql.sql, sql.parameters), (_) => _ as any);
}

function builderToError<Builder extends Compilable<any>>(builder: Builder) {
  const compiled = builder.compile();
  return { sql: compiled.sql, parameters: compiled.parameters };
}

export function runQueryOne<
  Builder extends Compilable<any>,
  Element extends InferResult<Builder> extends (infer X)[] ? X : never
>(builder: Builder): Effect.Effect<PgConnection, PgError | NotFound, Element> {
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
): Effect.Effect<PgConnection, PgError | NotFound | TooMany, Element> {
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

class PgCamelResult extends CamelCasePlugin {
  pgTransformResult<Data extends pg.QueryResult<pg.QueryResultRow>>(
    data: Data
  ): Data {
    if (data.rows && Array.isArray(data.rows)) {
      return {
        ...data,
        rows: data.rows.map((row) => this.mapRow(row)),
      };
    }

    return data;
  }
}

export function runRawQuery(sql: string, parameters?: readonly unknown[]) {
  const camel = new PgCamelResult();

  return pipe(
    PgConnection,
    Effect.flatMap(({ queryable }) =>
      Effect.async<never, PgError, unknown[]>((resume) => {
        queryable.query(
          { text: sql, values: parameters?.slice(0) },
          (
            error: pg.DatabaseError,
            data: pg.QueryResult<pg.QueryResultRow>
          ) => {
            if (error) {
              resume(
                Effect.fail(
                  new PgError({ code: error.code, message: error.message })
                )
              );
            } else {
              resume(Effect.succeed(camel.pgTransformResult(data).rows));
            }
          }
        );
      })
    )
  );
}

export function transaction<R, E1, A>(
  self: Effect.Effect<R, E1, A>,
  options?: { test?: boolean }
) {
  const matchSavepoint = <R1, R2, E1, E2, A1, A2>(
    onPositive: (name: string) => Effect.Effect<R1, E1, A1>,
    onZero: () => Effect.Effect<R2, E2, A2>
  ): Effect.Effect<PgConnection | R1 | R2, E1 | E2, A1 | A2> =>
    Effect.gen(function* ($) {
      const x = yield* $(PgConnection);
      return x._tag === "PgConnectionPoolClient" && x.savepoint > 0
        ? yield* $(onPositive(`savepoint_${x.savepoint}`))
        : yield* $(onZero());
    });

  const savepoint = matchSavepoint(
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

  const connect: Effect.Effect<PgConnection, never, PgConnectionPoolClient> =
    pipe(
      PgConnection,
      Effect.flatMap(
        pipe(
          Match.type<PgConnection>(),
          Match.tag("PgConnectionPool", (_) =>
            pipe(
              // XXX: remove promise
              Effect.promise(() => _.queryable.connect()),
              Effect.map((queryable) =>
                PgConnectionPoolClientService({ queryable, savepoint: 0 })
              )
            )
          ),
          Match.tag("PgConnectionPoolClient", (_) =>
            Effect.succeed(
              PgConnectionPoolClientService({
                queryable: _.queryable,
                savepoint: _.savepoint + 1,
              })
            )
          ),
          Match.exhaustive
        )
      )
    );

  const injectPoolClient = (_: PgConnection) =>
    Effect.updateService(PgConnection, () => _);

  const acquire = pipe(
    connect,
    Effect.flatMap((conn) =>
      pipe(
        savepoint,
        injectPoolClient(conn),
        Effect.flatMap(() => Effect.succeed(conn))
      )
    )
  );

  const use = (conn: PgConnection) => pipe(self, injectPoolClient(conn));

  const release = <E, A>(conn: PgConnectionPoolClient, exit: Exit.Exit<E, A>) =>
    pipe(
      exit,
      Exit.match(
        () => rollback,
        () => (options?.test ? rollback : commit)
      ),
      Effect.flatMap(() =>
        matchSavepoint(
          () => Effect.unit(),
          () => Effect.sync(conn.queryable.release)
        )
      ),
      Effect.orDie, // XXX handle error when rolling back?
      injectPoolClient(conn)
    );

  return Effect.acquireUseRelease(acquire, use, release);
}
