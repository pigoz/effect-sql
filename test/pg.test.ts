import { pipe } from "@effect/data/Function";
import * as E from "@effect/data/Either";
import * as Effect from "@effect/io/Effect";
import { it, describe, expect } from "./helpers";
import {
  runQuery,
  runQueryExactlyOne,
  runQueryOne,
  runRawQuery,
  transaction,
  withClient,
} from "effect-sql/pg";
import { PgError, NotFound, TooMany } from "effect-sql/errors";
import { City, User, db } from "./pg.dsl";
import { jsonAgg } from "effect-sql/pg/utils";

describe("pg", () => {
  it.pgtransaction("runQuery ==0", () =>
    Effect.gen(function* ($) {
      const query = runQuery(db.selectFrom("cities"));
      expect((yield* $(query)).length).toEqual(0);

      yield* $(runQuery(db.insertInto("cities").values({ name: "Foo" })));
      yield* $(runQuery(db.insertInto("cities").values({ name: "Bar" })));

      expect((yield* $(query)).length).toEqual(2);
    })
  );

  it.pgtransaction("runQuery ==2", () =>
    Effect.gen(function* ($) {
      yield* $(runQuery(db.insertInto("cities").values({ name: "Foo" })));
      yield* $(runQuery(db.insertInto("cities").values({ name: "Bar" })));

      const query = runQuery(db.selectFrom("cities"));
      expect((yield* $(query)).length).toEqual(2);
    })
  );

  it.pgtransaction("runQueryOne ==0: NotFound", () =>
    Effect.gen(function* ($) {
      const res1 = yield* $(
        db.selectFrom("cities"),
        runQueryOne,
        Effect.either
      );

      expect(res1).toEqual(
        E.left(
          new NotFound({
            sql: 'select from "cities"',
            parameters: [],
          })
        )
      );
    })
  );

  it.pgtransaction("runQueryOne ==1: finds record", () =>
    Effect.gen(function* ($) {
      yield* $(db.insertInto("cities").values({ name: "Foo" }), runQuery);

      const res2 = yield* $(
        db.selectFrom("cities").select("name"),
        runQueryOne,
        Effect.either
      );

      expect(res2).toEqual(E.right({ name: "Foo" }));
    })
  );

  it.pgtransaction("runQueryOne ==2: finds record", () =>
    Effect.gen(function* ($) {
      yield* $(db.insertInto("cities").values({ name: "Foo" }), runQuery);
      yield* $(db.insertInto("cities").values({ name: "Bar" }), runQuery);

      const res2 = yield* $(
        db.selectFrom("cities").select("name"),
        runQueryOne,
        Effect.either
      );

      expect(res2).toEqual(E.right({ name: "Foo" }));
    })
  );

  it.pgtransaction("runQueryExactlyOne ==0: NotFound", () =>
    Effect.gen(function* ($) {
      const res1 = yield* $(
        db.selectFrom("cities"),
        runQueryExactlyOne,
        Effect.either
      );

      expect(res1).toEqual(
        E.left(
          new NotFound({
            sql: 'select from "cities"',
            parameters: [],
          })
        )
      );
    })
  );

  it.pgtransaction("runQueryExactlyOne ==1: finds record", () =>
    Effect.gen(function* ($) {
      yield* $(runQuery(db.insertInto("cities").values({ name: "Foo" })));

      const res2 = yield* $(
        db.selectFrom("cities").select("name"),
        runQueryExactlyOne,
        Effect.either
      );

      expect(res2).toEqual(E.right({ name: "Foo" }));
    })
  );

  it.pgtransaction("runQueryExactlyOne ==2: finds record", () =>
    Effect.gen(function* ($) {
      yield* $(runQuery(db.insertInto("cities").values({ name: "Foo" })));
      yield* $(runQuery(db.insertInto("cities").values({ name: "Bar" })));

      const res2 = yield* $(
        db.selectFrom("cities").select("name"),
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

  it.pgtransaction("handles errors", () =>
    Effect.gen(function* ($) {
      const res = yield* $(
        "select * from dontexist;",
        runRawQuery,
        Effect.either
      );

      expect(res).toEqual(
        E.left(
          new PgError({
            code: "42P01",
            message: `relation "dontexist" does not exist`,
          })
        )
      );
    })
  );

  it.pgtransaction("transactions", () =>
    Effect.gen(function* ($) {
      const count = pipe(
        db.selectFrom("cities"),
        runQuery,
        Effect.map((_) => _.length)
      );

      const insert = pipe(
        db.insertInto("cities").values({ name: "foo" }),
        runQuery
      );

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
        withClient(
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

  it.pgtransaction("respects case", () =>
    Effect.gen(function* ($) {
      yield* $(db.insertInto("cities").values({ name: "Foo" }), runQuery);

      const res2 = yield* $(
        db.selectFrom("cities").select("name as cityName"),
        runQueryOne,
        Effect.either
      );

      expect(res2).toEqual(E.right({ cityName: "Foo" }));
    })
  );

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
});
