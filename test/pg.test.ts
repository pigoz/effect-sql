import { pipe } from "@effect/data/Function";
import * as E from "@effect/data/Either";
import * as Effect from "@effect/io/Effect";
import { it, describe, expect } from "./helpers";
import { cities } from "./pg.schema";
import {
  DrizzlePgError,
  RecordNotFound,
  db,
  runQuery,
  runQueryOne,
  runRawQuery,
} from "effect-drizzle/pg";

describe("pg", () => {
  it.pgtransaction("handles runQuery", () =>
    Effect.gen(function* ($) {
      const query = runQuery(db.select().from(cities));
      expect((yield* $(query)).length).toEqual(0);

      yield* $(runQuery(db.insert(cities).values({ name: "Foo" })));
      yield* $(runQuery(db.insert(cities).values({ name: "Bar" })));

      expect((yield* $(query)).length).toEqual(2);
    })
  );

  it.pgtransaction("handles runQueryOne", () =>
    Effect.gen(function* ($) {
      const res1 = yield* $(
        pipe(db.select().from(cities), runQueryOne, Effect.either)
      );

      expect(res1).toEqual(
        E.left(
          new RecordNotFound({
            sql: 'select "id", "name" from "cities"',
            params: [],
          })
        )
      );

      yield* $(runQuery(db.insert(cities).values({ name: "Foo" })));

      const res2 = yield* $(
        pipe(
          db.select({ name: cities.name }).from(cities),
          runQueryOne,
          Effect.either
        )
      );

      expect(res2).toEqual(E.right({ name: "Foo" }));
    })
  );

  it.pgtransaction("handles errors", () =>
    Effect.gen(function* ($) {
      const res = yield* $(
        pipe("select * from dontexist;", runRawQuery, Effect.either)
      );

      expect(res).toEqual(
        E.left(
          new DrizzlePgError({
            code: "42P01",
            message: `relation "dontexist" does not exist`,
          })
        )
      );
    })
  );
});
