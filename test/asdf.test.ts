import * as E from "@effect/data/Either";
import * as Effect from "@effect/io/Effect";
import { it, describe, expect } from "./helpers";
import { runQuery, runQueryOne } from "effect-sql/query";
import { NotFound } from "effect-sql/errors";
import { usingLayer, testLayer } from "./helpers/layer";

usingLayer(testLayer);

const select = `select * from "cities"`;
const insert = (name: string) => `insert into cities(name) values('${name}')`;

describe("asdf", () => {
  it.effect("runQuery ==0", () =>
    Effect.gen(function* ($) {
      expect((yield* $(select, runQuery)).rows.length).toEqual(0);
    })
  );

  it.effect("runQuery ==2", () =>
    Effect.gen(function* ($) {
      console.log("0");
      yield* $(insert("foo"), runQuery);
      console.log("1");
      yield* $(insert("bar"), runQuery);
      console.log("2");

      expect((yield* $(select, runQuery)).rows.length).toEqual(2);
    })
  );

  it.effect("runQueryOne ==0: NotFound", () =>
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
});
