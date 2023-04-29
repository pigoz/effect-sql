import * as Effect from "@effect/io/Effect";
import * as Context from "@effect/data/Context";

import {
  runQuery as runRawQuery,
  runQueryOne as runRawQueryOne,
  runQueryExactlyOne as runRawQueryExactlyOne,
  AfterQueryHook,
  afterQueryHook,
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

const withBuilder = <R, E, A>(
  self: Effect.Effect<R, E, A>
): Effect.Effect<R | KyselyQueryBuilder, E, A> =>
  Effect.flatMap(KyselyQueryBuilder, (builder) =>
    Effect.provideService(
      self,
      AfterQueryHook,
      afterQueryHook({
        hook: (_) => Effect.succeed(builder.afterQueryHook(_)),
      })
    )
  );

export function runQuery<
  C extends Compilable<unknown>,
  A extends InferResult<C>[number]
>(compilable: C) {
  const { sql, parameters } = compilable.compile();
  return withBuilder(runRawQuery<A>(sql, parameters));
}

export function runQueryRows<
  C extends Compilable<any>,
  A extends InferResult<C>[number]
>(compilable: C) {
  const { sql, parameters } = compilable.compile();
  return withBuilder(
    Effect.map(runRawQuery<A>(sql, parameters), (result) => result.rows)
  );
}

export function runQueryOne<
  C extends Compilable<unknown>,
  A extends InferResult<C>[number]
>(compilable: C) {
  const { sql, parameters } = compilable.compile();
  return withBuilder(runRawQueryOne<A>(sql, parameters));
}

export function runQueryExactlyOne<
  C extends Compilable<unknown>,
  A extends InferResult<C>[number]
>(compilable: C) {
  const { sql, parameters } = compilable.compile();
  return withBuilder(runRawQueryExactlyOne<A>(sql, parameters));
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

export interface KyselyQueryBuilder {
  readonly _: unique symbol;
}

export const KyselyQueryBuilder = Context.Tag<
  KyselyQueryBuilder,
  QueryBuilderDsl<any>
>(Symbol.for("pigoz/effect-sql/KyselyQueryBuilder"));

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

  afterQueryHook(result: QueryResult<UnknownRow>) {
    this.#plugins.forEach((plugin) => {
      result = plugin.transformResultSync({ result });
    });
    return result;
  }
}
