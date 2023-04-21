import { Table } from "drizzle-orm";
import { Kyselify } from "drizzle-orm/kysely";
import { QueryBuilderConfig } from "effect-sql/builders/kysely";

type CamelCaseString<S extends string> =
  S extends `${infer P1}_${infer P2}${infer P3}`
    ? `${Lowercase<P1>}${Uppercase<P2>}${CamelCaseString<P3>}`
    : Lowercase<S>;

type ColumnsToCamelCase<T> = {
  [K in keyof T as CamelCaseString<string & K>]: T[K];
};

export type InferDatabase<T extends Record<string, unknown>> = {
  [K in keyof T as T[K] extends Table ? K : never]: T[K] extends Table
    ? Kyselify<T[K]>
    : never;
};

export type CamelCase<D = InferDatabase<any>> = {
  [K in keyof D]: ColumnsToCamelCase<D[K]>;
};

export type InferDatabaseFromConfig<
  T extends Record<string, unknown>,
  C extends QueryBuilderConfig
> = C["useCamelCaseTransformer"] extends true
  ? CamelCase<InferDatabase<T>>
  : InferDatabase<T>;
