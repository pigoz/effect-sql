import * as E from "@effect/data/Either";
import * as Effect from "@effect/io/Effect";
import { it, describe, expect } from "./helpers";
import { db } from "./helpers/pg.drizzle.dsl";
import { cities } from "./helpers/pg.schema";
import { usingLayer, testLayer } from "./helpers/layer";

import {
  runQueryRows,
  runQueryOne,
  runQueryExactlyOne,
} from "effect-sql/builders/drizzle";
import { NotFound, TooMany } from "effect-sql/errors";

usingLayer(testLayer);

const selectFromCities = db.select().from(cities);
const selectNameFromCities = db.select({ name: cities.name }).from(cities);
const insertCity = (name: string) => db.insert(cities).values({ name });

describe("pg – drizzle", () => {
  it.effect("runQuery ==0", () =>
    Effect.gen(function* ($) {
      expect((yield* $(selectFromCities, runQueryRows)).length).toEqual(0);
    })
  );

  it.effect("runQuery ==2", () =>
    Effect.gen(function* ($) {
      yield* $(insertCity("Foo"), runQueryRows);
      yield* $(insertCity("Bar"), runQueryRows);
      expect((yield* $(selectFromCities, runQueryRows)).length).toEqual(2);
    })
  );

  it.effect("runQueryOne ==0: NotFound", () =>
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

  it.effect("runQueryOne ==1: finds record", () =>
    Effect.gen(function* ($) {
      yield* $(insertCity("Foo"), runQueryRows);

      const res2 = yield* $(selectNameFromCities, runQueryOne, Effect.either);

      expect(res2).toEqual(E.right({ name: "Foo" }));
    })
  );

  it.effect("runQueryOne ==2: finds record", () =>
    Effect.gen(function* ($) {
      yield* $(insertCity("Foo"), runQueryRows);
      yield* $(insertCity("Bar"), runQueryRows);

      const res2 = yield* $(selectNameFromCities, runQueryOne, Effect.either);

      expect(res2).toEqual(E.right({ name: "Foo" }));
    })
  );

  it.effect("runQueryExactlyOne ==0: NotFound", () =>
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

  it.effect("runQueryExactlyOne ==1: finds record", () =>
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

  it.effect("runQueryExactlyOne ==2: finds record", () =>
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

  it.effect.fails("respects case", () =>
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
});
