import {
  CamelCasePlugin,
  PluginTransformResultArgs,
  QueryResult,
  UnknownRow,
} from "kysely";

import { SyncKyselyPlugin } from "effect-sql/query/kysely";

type CamelCase<S extends string> =
  S extends `${infer P1}_${infer P2}${infer P3}`
    ? `${Lowercase<P1>}${Uppercase<P2>}${CamelCase<P3>}`
    : Lowercase<S>;

export type ColumnsToCamelCase<T> = {
  [K in keyof T as CamelCase<string & K>]: T[K];
};

export class SyncCamelCasePlugin
  extends CamelCasePlugin
  implements SyncKyselyPlugin
{
  // same code from transformResult() withouth the pointless promise
  transformResultSync(
    args: Omit<PluginTransformResultArgs, "queryId">
  ): QueryResult<UnknownRow> {
    if (args.result.rows && Array.isArray(args.result.rows)) {
      return {
        ...args.result,
        rows: args.result.rows.map((row) => this.mapRow(row)),
      };
    }

    return args.result;
  }
}
