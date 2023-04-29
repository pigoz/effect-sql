import { pipe } from "@effect/data/Function";
import * as E from "@effect/data/Either";
import * as Effect from "@effect/io/Effect";
import * as Layer from "@effect/io/Layer";
import { it, describe, expect } from "./helpers";
import {
  runQuery,
  runQueryRows,
  runQueryExactlyOne,
  runQueryOne,
  KyselyQueryBuilder,
} from "effect-sql/builders/kysely";
import { NotFound, TooMany } from "effect-sql/errors";
import { City, User, db } from "./helpers/pg.kysely.dsl";
import { jsonAgg } from "./helpers/json";
import { usingLayer, testLayer } from "./helpers/layer";

const select = db.selectFrom("cities").selectAll();
const selectName = db.selectFrom("cities").select("name");
const insert = (name: string) => db.insertInto("cities").values({ name });

usingLayer(
  Layer.provideMerge(testLayer, Layer.succeed(KyselyQueryBuilder, db))
);

describe("pg – kysely", () => {
  it.sandbox("runQuery ==0", () =>
    Effect.gen(function* ($) {
      expect((yield* $(select, runQueryRows)).length).toEqual(0);
    })
  );

  it.sandbox("runQuery ==2", () =>
    Effect.gen(function* ($) {
      yield* $(insert("foo"), runQueryRows);
      yield* $(insert("bar"), runQueryRows);

      expect((yield* $(select, runQueryRows)).length).toEqual(2);
    })
  );

  it.sandbox("runQueryOne ==0: NotFound", () =>
    Effect.gen(function* ($) {
      const res1 = yield* $(select, runQueryOne, Effect.either);

      expect(res1).toEqual(
        E.left(
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
      yield* $(insert("foo"), runQueryRows);

      const res2 = yield* $(selectName, runQueryOne, Effect.either);
      expect(res2).toEqual(E.right({ name: "foo" }));
    })
  );

  it.sandbox("runQueryOne ==2: finds record", () =>
    Effect.gen(function* ($) {
      yield* $(insert("foo"), runQueryRows);
      yield* $(insert("bar"), runQueryRows);

      const res2 = yield* $(selectName, runQueryOne, Effect.either);

      expect(res2).toEqual(E.right({ name: "foo" }));
    })
  );

  it.sandbox("runQueryExactlyOne ==0: NotFound", () =>
    Effect.gen(function* ($) {
      const res1 = yield* $(select, runQueryExactlyOne, Effect.either);

      expect(res1).toEqual(
        E.left(
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
      yield* $(insert("foo"), runQueryRows);

      const res2 = yield* $(selectName, runQueryExactlyOne, Effect.either);
      expect(res2).toEqual(E.right({ name: "foo" }));
    })
  );

  it.sandbox("runQueryExactlyOne ==2: finds record", () =>
    Effect.gen(function* ($) {
      yield* $(insert("foo"), runQueryRows);
      yield* $(insert("bar"), runQueryRows);

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

  it.sandbox("respects case (as)", () =>
    Effect.gen(function* ($) {
      yield* $(insert("Foo"), runQueryRows);

      const res2 = yield* $(
        db.selectFrom("cities").select("name as cityName"),
        runQueryOne,
        Effect.either
      );

      expect(res2).toEqual(E.right({ cityName: "Foo" }));
    })
  );

  it.sandbox("respects case (runQuery*)", () =>
    Effect.gen(function* ($) {
      yield* $(insert("Foo"), runQueryRows);
      const query = db.selectFrom("cities").select("createdAt");

      const res2 = yield* $(
        Effect.all(
          Effect.map(runQuery(query), (_) => _.rows[0]!),
          Effect.map(runQueryRows(query), (_) => _[0]!),
          runQueryOne(query),
          runQueryExactlyOne(query)
        ),
        Effect.either
      );

      expect(res2).toHaveProperty("right[0].createdAt");
      expect(res2).toHaveProperty("right[1].createdAt");
      expect(res2).toHaveProperty("right[2].createdAt");
      expect(res2).toHaveProperty("right[3].createdAt");
    })
  );

  it.sandbox("json_agg", () =>
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
        runQueryRows
      );

      expect(manyToManySub[0]?.id).toEqual(factory.haruhi.id);
      expect(manyToManySub[0]?.visited.length).toEqual(3);
      expect(manyToManySub[0]?.visited[0]?.cityName).toEqual(
        factory.tokyo.name
      );
    })
  );
});
