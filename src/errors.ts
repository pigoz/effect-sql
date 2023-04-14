import * as Data from "@effect/data/Data";

const DatabaseErrorSymbolKey = "pigoz/effect-sql/DatabaseError";
const DatabaseErrorTypeId: unique symbol = Symbol.for(DatabaseErrorSymbolKey);
type DatabaseErrorTypeId = typeof DatabaseErrorTypeId;

export class DatabaseError extends Data.TaggedClass("DatabaseError")<{
  readonly code?: string;
  readonly name?: string;
  readonly message: string;
}> {
  readonly [DatabaseErrorTypeId] = DatabaseErrorTypeId;
}

const MigrationErrorTypeId: unique symbol = Symbol.for(
  "pigoz/effect-sql/MigrationError"
);

type MigrationErrorTypeId = typeof MigrationErrorTypeId;

export class MigrationError extends Data.TaggedClass("MigrationError")<{
  readonly error: unknown;
}> {
  readonly [MigrationErrorTypeId] = MigrationErrorTypeId;
}

export const isDatabaseError = (u: unknown): u is DatabaseError =>
  typeof u === "object" && u != null && DatabaseErrorTypeId in u;

const NotFoundSymbolKey = "pigoz/effect-sql/NotFound";
const NotFoundTypeId: unique symbol = Symbol.for(NotFoundSymbolKey);
type NotFoundTypeId = typeof NotFoundTypeId;

export class NotFound extends Data.TaggedClass("NotFound")<{
  readonly sql: string;
  readonly parameters: readonly unknown[];
}> {
  readonly [NotFoundTypeId] = NotFoundTypeId;
}

export const isNotFound = (u: unknown): u is NotFound =>
  typeof u === "object" && u != null && NotFoundTypeId in u;

const TooManySymbolKey = "pigoz/effect-sql/TooMany";
const TooManyTypeId: unique symbol = Symbol.for(TooManySymbolKey);
type TooManyTypeId = typeof TooManyTypeId;

export class TooMany extends Data.TaggedClass("TooMany")<{
  readonly sql: string;
  readonly parameters: readonly unknown[];
}> {
  readonly [TooManyTypeId] = TooManyTypeId;
}

export const isTooMany = (u: unknown): u is TooMany =>
  typeof u === "object" && u != null && TooManyTypeId in u;
