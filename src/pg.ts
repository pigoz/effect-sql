import { LazyArg, pipe } from "@effect/data/Function";
import * as Effect from "@effect/io/Effect";
import * as Match from "@effect/match";
import * as Exit from "@effect/io/Exit";
import * as Context from "@effect/data/Context";
import * as Either from "@effect/data/Either";
import * as REA from "@effect/data/ReadonlyArray";
import { QueryPromise } from "drizzle-orm/query-promise";
import pg from "pg";
import {
  PgError,
  NotFound,
  TooMany,
  PgMigrationError,
} from "effect-drizzle/errors";

// https://github.com/drizzle-team/drizzle-orm/issues/163
import { drizzle } from "drizzle-orm/node-postgres/index.js";
import { migrate as drizzleMigrate } from "drizzle-orm/node-postgres/migrator.js";

export * from "drizzle-orm/pg-core/index.js";

/*
 * Drizzle implements Lazy Promises in it's query builder interface.
 * As long as execute() or then() isn't called, this will not hit the database.
 */
export const db = drizzle(null as any);

export class PgConnectionPool {
  readonly _tag = "PgConnectionPool";
  constructor(readonly queryable: pg.Pool, readonly savepoint: number = 0) {}
}

export class PgConnectionPoolClient {
  readonly _tag = "PgConnectionPoolClient";
  constructor(
    readonly queryable: pg.PoolClient,
    readonly savepoint: number = 0
  ) {}
}

export type PgConnection = PgConnectionPool | PgConnectionPoolClient;
export const PgConnection = Context.Tag<PgConnection>("PgConnection");

type PgBuilder<A> = QueryPromise<A> & {
  toSQL: () => { sql: string; params: unknown[] };
};

export function runQuery<Builder extends PgBuilder<any>>(
  builder: Builder
): Effect.Effect<PgConnection, PgError, Awaited<Builder>> {
  const sql = builder.toSQL();
  return Effect.map(runRawQuery(sql.sql, sql.params), (_) => _ as any);
}

export function runQueryOne<
  Builder extends PgBuilder<any>,
  Element extends Awaited<Builder> extends (infer X)[] ? X : never
>(builder: Builder): Effect.Effect<PgConnection, PgError | NotFound, Element> {
  return pipe(
    builder,
    runQuery,
    Effect.flatMap((x) => {
      return pipe(
        x as Element[],
        REA.head,
        Either.fromOption(() => new NotFound({ ...builder.toSQL() })),
        Effect.fromEither
      );
    })
  );
}

export function runQueryExactlyOne<
  Builder extends PgBuilder<any>,
  Element extends Awaited<Builder> extends (infer X)[] ? X : never
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
          return Effect.fail(new TooMany({ ...builder.toSQL() }));
        }

        return pipe(
          head,
          Either.fromNullable(() => new NotFound({ ...builder.toSQL() })),
          Effect.fromEither
        );
      })
    )
  );
}

export function runRawQuery(text: string, values?: unknown[]) {
  return pipe(
    PgConnection,
    Effect.flatMap(({ queryable }) =>
      Effect.async<never, PgError, unknown[]>((resume) => {
        const query = { text, values };
        queryable.query(
          query,
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
              resume(Effect.succeed(data.rows));
            }
          }
        );
      })
    )
  );
}

export function transaction<R, E1, A>(
  self: LazyArg<Effect.Effect<R, E1, A>>,
  options?: { test?: boolean }
) {
  const matchSavepoint = <R1, R2, E1, E2, A1, A2>(
    onPositive: (name: string) => Effect.Effect<R1, E1, A1>,
    onZero: () => Effect.Effect<R2, E2, A2>
  ): Effect.Effect<PgConnection | R1 | R2, E1 | E2, A1 | A2> =>
    Effect.gen(function* ($) {
      const x = yield* $(PgConnection);
      return x.savepoint > 0
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
              Effect.map(
                (queryable) => new PgConnectionPoolClient(queryable, 0)
              )
            )
          ),
          Match.tag("PgConnectionPoolClient", (_) =>
            Effect.succeed({ ..._, savepoint: _.savepoint + 1 })
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

  const use = (conn: PgConnection) =>
    pipe(Effect.suspend(self), injectPoolClient(conn));

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

export function migrate(migrationsFolder: string) {
  return pipe(
    PgConnection,
    Effect.tap((conn) =>
      Effect.tryCatchPromise(
        () => {
          const client = drizzle(conn.queryable);
          return drizzleMigrate(client, { migrationsFolder });
        },
        (error) => new PgMigrationError({ error })
      )
    )
  );
}
