import * as Data from "@effect/data/Data";

const PgErrorSymbolKey = "pigoz/effect-drizzle/PgError";
const PgErrorTypeId: unique symbol = Symbol.for(PgErrorSymbolKey);
type PgErrorTypeId = typeof PgErrorTypeId;

export class PgError extends Data.TaggedClass("PgError")<{
  code: string;
  message: string;
}> {
  readonly [PgErrorTypeId] = PgErrorTypeId;
}

export const isPgError = (u: unknown): u is PgError =>
  typeof u === "object" && u != null && PgErrorTypeId in u;

const NotFoundSymbolKey = "pigoz/effect-drizzle/NotFound";
const NotFoundTypeId: unique symbol = Symbol.for(NotFoundSymbolKey);
type NotFoundTypeId = typeof NotFoundTypeId;

export class NotFound extends Data.TaggedClass("NotFound")<{
  sql: string;
  params: unknown[];
}> {
  readonly [NotFoundTypeId] = NotFoundTypeId;
}

export const isNotFound = (u: unknown): u is NotFound =>
  typeof u === "object" && u != null && NotFoundTypeId in u;

const TooManySymbolKey = "pigoz/effect-drizzle/TooMany";
const TooManyTypeId: unique symbol = Symbol.for(TooManySymbolKey);
type TooManyTypeId = typeof TooManyTypeId;

export class TooMany extends Data.TaggedClass("TooMany")<{
  sql: string;
  params: unknown[];
}> {
  readonly [TooManyTypeId] = TooManyTypeId;
}

export const isTooMany = (u: unknown): u is TooMany =>
  typeof u === "object" && u != null && TooManyTypeId in u;
