import { LazyArg, pipe } from "@effect/data/Function";
import * as Effect from "@effect/io/Effect";
import * as Data from "@effect/data/Data";
import * as Match from "@effect/match";
import * as Exit from "@effect/io/Exit";
import * as Context from "@effect/data/Context";
import { QueryPromise } from "drizzle-orm/query-promise";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

export * from "drizzle-orm/pg-core";

/*
 * Drizzle implements Lazy Promises in it's query builder interface.
 * As long as execute() or then() isn't called, this will not hit the database.
 */
export const db = drizzle(null as any);

export class DrizzlePgConnectionPool {
  readonly _tag = "DrizzlePgConnectionPool";
  constructor(readonly queryable: pg.Pool, readonly savepoint: number = 0) {}
}

export class DrizzlePgConnectionPoolClient {
  readonly _tag = "DrizzlePgConnectionPoolClient";
  constructor(
    readonly queryable: pg.PoolClient,
    readonly savepoint: number = 0
  ) {}
}

export type DrizzlePgConnection =
  | DrizzlePgConnectionPool
  | DrizzlePgConnectionPoolClient;

export const DrizzlePgConnection =
  Context.Tag<DrizzlePgConnection>("DrizzleConnection");

type DrizzlePgBuilder<A> = QueryPromise<A> & {
  toSQL: () => { sql: string; params: unknown[] };
};

export class DrizzlePgError extends Data.TaggedClass("DrizzlePgError")<{
  message: string;
  code: string;
}> {}

export function runQuery<Builder extends DrizzlePgBuilder<any>>(
  builder: Builder
): Effect.Effect<DrizzlePgConnection, DrizzlePgError, Awaited<Builder>> {
  const sql = builder.toSQL();
  return runRawQuery(sql.sql, sql.params);
}

export class RecordNotFound extends Data.TaggedClass("RecordNotFound")<{
  sql: string;
  params: unknown[];
}> {}

export function runQueryOne<Builder extends DrizzlePgBuilder<any>>(
  builder: Builder
): Awaited<Builder> extends (infer X)[]
  ? Effect.Effect<DrizzlePgConnection, DrizzlePgError, X>
  : never {
  return pipe(
    builder,
    runQuery,
    Effect.flatMap((x) => {
      const list = x as any;
      // maybe should Effect.die if > 1 or add runQueryExactlyOne
      if (list.length < 1) {
        return Effect.fail(new RecordNotFound({ ...builder.toSQL() }));
      } else {
        return Effect.succeed(list[0]);
      }
    })
  ) as any;
}

export function runRawQuery<R = unknown[]>(text: string, values?: unknown[]) {
  return pipe(
    Effect.service(DrizzlePgConnection),
    Effect.flatMap(({ queryable }) =>
      Effect.async<never, DrizzlePgError, R>((resume) => {
        const query = { text, values };
        queryable.query(query, (error: any, data) => {
          if (error) {
            resume(
              Effect.fail(
                new DrizzlePgError({
                  code: (error as any).code,
                  message: error.message,
                })
              )
            );
          } else {
            resume(Effect.succeed(data.rows as any));
          }
        });
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
  ): Effect.Effect<DrizzlePgConnection | R1 | R2, E1 | E2, A1 | A2> =>
    Effect.gen(function* ($) {
      const x = yield* $(Effect.service(DrizzlePgConnection));
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

  const connect: Effect.Effect<
    DrizzlePgConnection,
    never,
    DrizzlePgConnectionPoolClient
  > = pipe(
    Effect.service(DrizzlePgConnection),
    Effect.flatMap(
      pipe(
        Match.type<DrizzlePgConnection>(),
        Match.tag("DrizzlePgConnectionPool", (_) =>
          pipe(
            // XXX: remove promise
            Effect.promise(() => _.queryable.connect()),
            Effect.map(
              (queryable) => new DrizzlePgConnectionPoolClient(queryable, 0)
            )
          )
        ),
        Match.tag("DrizzlePgConnectionPoolClient", (_) =>
          Effect.succeed({ ..._, savepoint: _.savepoint + 1 })
        ),
        Match.exhaustive
      )
    )
  );

  const injectPoolClient = (_: DrizzlePgConnection) =>
    Effect.updateService(DrizzlePgConnection, () => _);

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

  const use = (conn: DrizzlePgConnection) =>
    pipe(Effect.suspend(self), injectPoolClient(conn));

  const release = <E, A>(
    conn: DrizzlePgConnectionPoolClient,
    exit: Exit.Exit<E, A>
  ) =>
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
