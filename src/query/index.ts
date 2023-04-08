import { Table } from "drizzle-orm";
import { Kyselify } from "drizzle-orm/kysely";
import {
  DummyDriver,
  Kysely,
  KyselyConfig,
  KyselyPlugin,
  PluginTransformResultArgs,
  QueryResult,
  UnknownRow,
} from "kysely";

import * as Context from "@effect/data/Context";

import {
  ColumnsToCamelCase,
  SyncCamelCasePlugin,
} from "effect-sql/query/camelcase";

export interface SyncKyselyPlugin extends KyselyPlugin {
  transformResultSync(
    args: Omit<PluginTransformResultArgs, "queryId">
  ): QueryResult<UnknownRow>;
}

type InferDatabaseFromSchema<T extends Record<string, Table>> = {
  [K in keyof T]: Kyselify<T[K]>;
};

type CamelCase<T extends InferDatabaseFromSchema<Record<string, Table>>> = {
  [K in keyof T]: ColumnsToCamelCase<T[K]>;
};

export type InferDatabase<T extends QueryBuilderDsl<any, any, any>> =
  T extends QueryBuilderDsl<any, any, infer A> ? A : never;

export interface QueryBuilderConfig {
  useCamelCaseTransformer?: boolean;
}

export interface QueryBuilder extends QueryBuilderDsl<{}, {}, any> {}

export const QueryBuilder = Context.Tag<QueryBuilder>("QueryBuilder");

export class QueryBuilderDsl<
  T extends Record<string, Table>,
  O extends QueryBuilderConfig,
  Database = O["useCamelCaseTransformer"] extends true
    ? CamelCase<InferDatabaseFromSchema<T>>
    : InferDatabaseFromSchema<T>
> extends Kysely<Database> {
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

  transformResultSync(
    result: PluginTransformResultArgs["result"]
  ): QueryResult<UnknownRow> {
    this.#plugins.forEach((plugin) => {
      result = plugin.transformResultSync({ result });
    });
    return result;
  }
}
