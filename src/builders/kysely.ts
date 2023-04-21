import * as Effect from "@effect/io/Effect";

import {
  runQuery as runRawQuery,
  runQueryOne as runRawQueryOne,
  runQueryExactlyOne as runRawQueryExactlyOne,
} from "effect-sql/query";

import {
  DummyDriver,
  Kysely,
  KyselyConfig,
  KyselyPlugin,
  CamelCasePlugin,
  PluginTransformResultArgs,
  QueryResult,
  UnknownRow,
  Compilable,
  InferResult,
} from "kysely";

export function runQuery<
  C extends Compilable<unknown>,
  A extends InferResult<C>[number]
>(compilable: C) {
  const { sql, parameters } = compilable.compile();
  return runRawQuery<A>(sql, parameters);
}

export function runQueryRows<
  C extends Compilable<any>,
  A extends InferResult<C>[number]
>(compilable: C) {
  const { sql, parameters } = compilable.compile();
  return Effect.map(runRawQuery<A>(sql, parameters), (result) => result.rows);
}

export function runQueryOne<
  C extends Compilable<unknown>,
  A extends InferResult<C>[number]
>(compilable: C) {
  const { sql, parameters } = compilable.compile();
  return runRawQueryOne<A>(sql, parameters);
}

export function runQueryExactlyOne<
  C extends Compilable<unknown>,
  A extends InferResult<C>[number]
>(compilable: C) {
  const { sql, parameters } = compilable.compile();
  return runRawQueryExactlyOne<A>(sql, parameters);
}

class SyncCamelCasePlugin extends CamelCasePlugin implements SyncKyselyPlugin {
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

export interface QueryBuilderConfig {
  useCamelCaseTransformer?: boolean;
}

export class QueryBuilderDsl<Database> extends Kysely<Database> {
  readonly #plugins: readonly SyncKyselyPlugin[];

  constructor(
    config: Omit<KyselyConfig["dialect"], "createDriver"> & QueryBuilderConfig
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
