import { sql, Expression, RawBuilder, Simplify } from "kysely";

export function jsonAgg<O>(expr: Expression<O>): RawBuilder<Simplify<O>[]> {
  return sql`(select coalesce(json_agg(agg), '[]') from ${expr} as agg)`;
}

export function jsonObject<O>(expr: Expression<O>): RawBuilder<Simplify<O>> {
  return sql`(select to_json(obj) from ${expr} as obj)`;
}
