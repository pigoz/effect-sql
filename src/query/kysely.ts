import { Table } from "drizzle-orm";
import { Kyselify } from "drizzle-orm/kysely";
import {
  DummyDriver,
  Kysely,
  KyselyConfig,
  KyselyPlugin,
  CamelCasePlugin,
  PluginTransformResultArgs,
  QueryResult,
  UnknownRow,
} from "kysely";

import { TransformResultSync } from "effect-sql/query";

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

export interface SyncKyselyPlugin extends KyselyPlugin {
  transformResultSync(
    args: Omit<PluginTransformResultArgs, "queryId">
  ): QueryResult<UnknownRow>;
}

type InferDatabaseFromSchema<T extends Record<string, Table>> = {
  [K in keyof T]: Kyselify<T[K]>;
};

type CamelCaseDatabase<T extends InferDatabaseFromSchema<any>> = {
  [K in keyof T]: ColumnsToCamelCase<T[K]>;
};

export type InferDatabase<T extends QueryBuilderDsl<any, any, any>> =
  T extends QueryBuilderDsl<any, any, infer A> ? A : never;

export interface QueryBuilderConfig {
  useCamelCaseTransformer?: boolean;
}

export class QueryBuilderDsl<
    T extends Record<string, Table>,
    O extends QueryBuilderConfig,
    Database = O["useCamelCaseTransformer"] extends true
      ? CamelCaseDatabase<InferDatabaseFromSchema<T>>
      : InferDatabaseFromSchema<T>
  >
  extends Kysely<Database>
  implements TransformResultSync
{
  readonly #plugins: readonly SyncKyselyPlugin[];

  constructor(
    config: {
      schema: T;
    } & Omit<KyselyConfig["dialect"], "createDriver"> &
      O
  ) {
    const plugins: SyncKyselyPlugin[] = config.useCamelCaseTransformer
      ? [new SyncCamelCasePlugin()]
      : [];

    super({
      dialect: {
        createAdapter: config.createAdapter,
        createIntrospector: config.createIntrospector,
        createQueryCompiler: config.createQueryCompiler,
        createDriver: () => new DummyDriver(),
      },
      plugins,
    });

    this.#plugins = plugins;
  }

  transformResultSync(result: PluginTransformResultArgs["result"]) {
    this.#plugins.forEach((plugin) => {
      result = plugin.transformResultSync({ result });
    });
    return result;
  }
}
