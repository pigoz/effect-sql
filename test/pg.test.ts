import { pipe, Effect, Either, Layer, Config, ConfigSecret } from "effect";
import { it, describe, expect } from "./helpers";
import {
  ConnectionPool,
  ConnectionPoolScopedService,
  runQuery,
  runQueryOne,
  runQueryExactlyOne,
  transaction,
  IsolationLevel,
  Serializable,
} from "effect-sql/query";
import { DatabaseError, NotFound, TooMany } from "effect-sql/errors";
import { usingLayer, testLayer } from "./helpers/layer";

usingLayer(testLayer);

const select = `select * from "cities"`;
const selectName = `select "name" from "cities"`;
const insert = (name: string) => `insert into cities(name) values('${name}')`;

describe("pg", () => {
  it.sandbox("runQuery ==0", () =>
    Effect.gen(function* ($) {
      expect((yield* $(select, runQuery)).rows.length).toEqual(0);
    })
  );

  it.sandbox("runQuery ==2", () =>
    Effect.gen(function* ($) {
      yield* $(insert("foo"), runQuery);
      yield* $(insert("bar"), runQuery);

      expect((yield* $(select, runQuery)).rows.length).toEqual(2);
    })
  );

  it.sandbox("runQueryOne ==0: NotFound", () =>
    Effect.gen(function* ($) {
      const res1 = yield* $(select, runQueryOne, Effect.either);

      expect(res1).toEqual(
        Either.left(
          new NotFound({
            sql: 'select * from "cities"',
            parameters: [],
          })
        )
      );
    })
  );

  it.sandbox("runQueryOne ==1: finds record", () =>
    Effect.gen(function* ($) {
      yield* $(insert("foo"), runQuery);

      const res2 = yield* $(selectName, runQueryOne, Effect.either);
      expect(res2).toEqual(Either.right({ name: "foo" }));
    })
  );

  it.sandbox("runQueryOne ==2: finds record", () =>
    Effect.gen(function* ($) {
      yield* $(insert("foo"), runQuery);
      yield* $(insert("bar"), runQuery);

      const res2 = yield* $(selectName, runQueryOne, Effect.either);

      expect(res2).toEqual(Either.right({ name: "foo" }));
    })
  );

  it.sandbox("runQueryExactlyOne ==0: NotFound", () =>
    Effect.gen(function* ($) {
      const res1 = yield* $(select, runQueryExactlyOne, Effect.either);

      expect(res1).roEqual(
        Either.left(
          new NotFound({
            sql: 'select * from "cities"',
            parameters: [],
          })
        )
      );
    })
  );

  it.sandbox("runQueryExactlyOne ==1: finds record", () =>
    Effect.gen(function* ($) {
      yield* $(insert("foo"), runQuery);

      const res2 = yield* $(selectName, runQueryExactlyOne, Effect.either);
      expect(res2).toEqual(Either.right({ name: "foo" }));
    })
  );

  it.sandbox("runQueryExactlyOne ==2: finds record", () =>
    Effect.gen(function* ($) {
      yield* $(insert("foo"), runQuery);
      yield* $(insert("bar"), runQuery);

      const res2 = yield* $(selectName, runQueryExactlyOne, Effect.either);

      expect(res2).toEqual(
        E.left(
          new TooMany({
            sql: 'select "name" from "cities"',
            parameters: [],
          })
        )
      );
    })
  );

  it.sandbox("handle QueryError", () =>
    Effect.gen(function* ($) {
      const res = yield* $("select * from dontexist;", runQuery, Effect.either);

      expect(res).toEqual(
        E.left(
          new DatabaseError({
            code: "42P01",
            name: "QueryError",
            message: `relation "dontexist" does not exist`,
          })
        )
      );
    })
  );

  it.effect("handle PoolError", () =>
    Effect.gen(function* ($) {
      const res = yield* $(
        select,
        runQuery,
        Effect.provideSomeLayer(
          Layer.scoped(
            ConnectionPool,
            ConnectionPoolScopedService({
              databaseUrl: Config.succeed(
                ConfigSecret.fromString("postgres://127.0.0.1:80")
              ),
            })
          )
        ),
        Effect.either
      );

      expect(res).toEqual(
        Either.left(
          new DatabaseError({
            name: "ConnectionPoolError",
            message: `connect ECONNREFUSED 127.0.0.1:80`,
          })
        )
      );
    })
  );

  it.sandbox("transactions", () =>
    Effect.gen(function* ($) {
      const count = pipe(
        select,
        runQuery,
        Effect.map((_) => _.rows.length)
      );

      yield* $(insert("foo"), runQuery, transaction);
      expect(yield* $(count)).toEqual(1);

      yield* $(insert("foo"), runQuery, transaction);
      expect(yield* $(count)).toEqual(2);

      yield* $(
        Effect.all(runQuery(insert("foo")), Effect.fail("fail")),
        transaction,
        Effect.either
      );

      expect(yield* $(count)).toEqual(2);
    })
  );

  it.effect("create database", () =>
    Effect.gen(function* ($) {
      const res = yield* $(
        Effect.all(
          runQuery(`drop database if exists "foo"`),
          runQuery(`create database "foo"`),
          runQuery(`drop database "foo"`)
        ),
        Effect.zipRight(Effect.succeed("ok")),
        Effect.either
      );

      expect(res).toEqual(E.right("ok"));
    })
  );

  it.effect("isolation level service", () =>
    Effect.gen(function* ($) {
      const res = yield* $(
        `show transaction isolation level`,
        runQueryExactlyOne,
        transaction,
        Effect.provideService(IsolationLevel, Serializable),
        Effect.either
      );

      expect(res).toEqual(E.right({ transaction_isolation: "serializable" }));
    })
  );
});
