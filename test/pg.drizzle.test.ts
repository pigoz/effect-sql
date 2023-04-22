import { pipe } from "@effect/data/Function";
import * as E from "@effect/data/Either";
import * as Effect from "@effect/io/Effect";
import * as Layer from "@effect/io/Layer";
import * as Config from "@effect/io/Config";
import * as ConfigSecret from "@effect/io/Config/Secret";
import { it, describe, expect } from "./helpers";
import {
  ConnectionPool,
  ConnectionPoolScopedService,
  runQuery as runRawQuery,
  transaction,
  connected,
} from "effect-sql/query";
import {
  runQueryRows,
  runQueryOne,
  runQueryExactlyOne,
} from "effect-sql/builders/drizzle";
import { DatabaseError, NotFound, TooMany } from "effect-sql/errors";
import { db } from "./pg.drizzle.dsl";
import { cities } from "./pg.schema";
import { usingLayer, testLayer } from "./helpers/layer";
import { Driver } from "effect-sql/drivers/pg";

usingLayer(testLayer);

const selectFromCities = db.select().from(cities);
const selectNameFromCities = db.select({ name: cities.name }).from(cities);
const insertCity = (name: string) => db.insert(cities).values({ name });

describe("pg – drizzle", () => {
  it.pgtransaction("runQuery ==0", () =>
    Effect.gen(function* ($) {
      expect((yield* $(selectFromCities, runQueryRows)).length).toEqual(0);
    })
  );

  it.pgtransaction("runQuery ==2", () =>
    Effect.gen(function* ($) {
      yield* $(insertCity("Foo"), runQueryRows);
      yield* $(insertCity("Bar"), runQueryRows);
      expect((yield* $(selectFromCities, runQueryRows)).length).toEqual(2);
    })
  );

  it.pgtransaction("runQueryOne ==0: NotFound", () =>
    Effect.gen(function* ($) {
      const res1 = yield* $(selectFromCities, runQueryOne, Effect.either);

      expect(res1).toEqual(
        E.left(
          new NotFound({
            sql: 'select "id", "name" from "cities"',
            parameters: [],
          })
        )
      );
    })
  );

  it.pgtransaction("runQueryOne ==1: finds record", () =>
    Effect.gen(function* ($) {
      yield* $(insertCity("Foo"), runQueryRows);

      const res2 = yield* $(selectNameFromCities, runQueryOne, Effect.either);

      expect(res2).toEqual(E.right({ name: "Foo" }));
    })
  );

  it.pgtransaction("runQueryOne ==2: finds record", () =>
    Effect.gen(function* ($) {
      yield* $(insertCity("Foo"), runQueryRows);
      yield* $(insertCity("Bar"), runQueryRows);

      const res2 = yield* $(selectNameFromCities, runQueryOne, Effect.either);

      expect(res2).toEqual(E.right({ name: "Foo" }));
    })
  );

  it.pgtransaction("runQueryExactlyOne ==0: NotFound", () =>
    Effect.gen(function* ($) {
      const res1 = yield* $(
        selectFromCities,
        runQueryExactlyOne,
        Effect.either
      );

      expect(res1).toEqual(
        E.left(
          new NotFound({
            sql: 'select "id", "name" from "cities"',
            parameters: [],
          })
        )
      );
    })
  );

  it.pgtransaction("runQueryExactlyOne ==1: finds record", () =>
    Effect.gen(function* ($) {
      yield* $(insertCity("Foo"), runQueryRows);

      const res2 = yield* $(
        selectNameFromCities,
        runQueryExactlyOne,
        Effect.either
      );

      expect(res2).toEqual(E.right({ name: "Foo" }));
    })
  );

  it.pgtransaction("runQueryExactlyOne ==2: finds record", () =>
    Effect.gen(function* ($) {
      yield* $(insertCity("Foo"), runQueryRows);
      yield* $(insertCity("Bar"), runQueryRows);

      const res2 = yield* $(
        selectNameFromCities,
        runQueryExactlyOne,
        Effect.either
      );

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

  it.pgtransaction("handle QueryError", () =>
    Effect.gen(function* ($) {
      const res = yield* $(
        "select * from dontexist;",
        runRawQuery,
        Effect.either
      );

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
        selectFromCities,
        runQueryRows,
        Effect.provideSomeLayer(
          Layer.scoped(
            ConnectionPool,
            ConnectionPoolScopedService(Driver(), {
              databaseUrl: Config.succeed(
                ConfigSecret.fromString("postgres://127.0.0.1:80")
              ),
            })
          )
        ),
        Effect.either
      );

      expect(res).toEqual(
        E.left(
          new DatabaseError({
            name: "ConnectionPoolError",
            message: `connect ECONNREFUSED 127.0.0.1:80`,
          })
        )
      );
    })
  );

  it.pgtransaction("transactions", () =>
    Effect.gen(function* ($) {
      const count = pipe(
        selectFromCities,
        runQueryRows,
        Effect.map((_) => _.length)
      );

      const insert = runQueryRows(insertCity("Foo"));

      yield* $(insert, transaction);
      expect(yield* $(count)).toEqual(1);

      yield* $(insert, transaction);
      expect(yield* $(count)).toEqual(2);

      yield* $(
        Effect.all(insert, Effect.fail("fail")),
        transaction,
        Effect.either
      );

      expect(yield* $(count)).toEqual(2);
    })
  );

  it.effect("create database", () =>
    Effect.gen(function* ($) {
      const res = yield* $(
        connected(
          Effect.all(
            runRawQuery(`drop database if exists "foo"`),
            runRawQuery(`create database "foo";`),
            runRawQuery(`drop database "foo"`)
          )
        ),
        Effect.zipRight(Effect.succeed("ok")),
        Effect.either
      );

      expect(res).toEqual(E.right("ok"));
    })
  );

  it.pgtransaction.fails("respects case", () =>
    Effect.gen(function* ($) {
      yield* $(insertCity("Foo"), runQueryRows);

      const res2 = yield* $(
        db.select({ cityName: cities.name }).from(cities),
        runQueryOne,
        Effect.either
      );

      expect(res2).toEqual(E.right({ cityName: "Foo" }));
    })
  );

  /*
  it.pgtransaction("json_agg", () =>
    Effect.gen(function* ($) {
      const insertCity = (name: string) =>
        pipe(
          db.insertInto("cities").values({ name }).returningAll(),
          runQueryExactlyOne
        );

      const insertUser = (fullName: string) =>
        pipe(
          db
            .insertInto("users")
            .values({ fullName: fullName, phone: "+39012321" })
            .returningAll(),
          runQueryExactlyOne
        );

      const insertVisits = (city: City, user: User, value: number) =>
        pipe(
          db
            .insertInto("visits")
            .values({ cityId: city.id, userId: user.id, value })
            .returningAll(),
          runQueryExactlyOne
        );

      const factory = yield* $(
        Effect.all({
          tokyo: insertCity("Tokyo"),
          kyoto: insertCity("Kyoto"),
          osaka: insertCity("Osaka"),
          haruhi: insertUser("Haruhi"),
          nagato: insertUser("Nagato"),
        }),
        Effect.tap((_) =>
          Effect.all(
            insertVisits(_.kyoto, _.haruhi, 12),
            insertVisits(_.tokyo, _.haruhi, 17),
            insertVisits(_.osaka, _.haruhi, 10),
            insertVisits(_.tokyo, _.nagato, 9999)
          )
        )
      );

      const manyToManySub = yield* $(
        db
          .selectFrom("users")
          .selectAll()
          .select((eb) =>
            jsonAgg(
              eb
                .selectFrom("visits")
                .leftJoin("cities", "cities.id", "visits.cityId")
                .select(["visits.value as count", "cities.name as cityName"])
                .whereRef("visits.userId", "=", "users.id")
                .orderBy("visits.value", "desc")
            ).as("visited")
          ),
        runQuery
      );

      expect(manyToManySub[0]?.id).toEqual(factory.haruhi.id);
      expect(manyToManySub[0]?.visited.length).toEqual(3);
      expect(manyToManySub[0]?.visited[0]?.cityName).toEqual(
        factory.tokyo.name
      );
    })
  );
  */
});
