import { drizzle } from "drizzle-orm/node-postgres";

export function queryBuilderDsl() {
  return drizzle(Symbol.for("postgres-stub") as any);
}
