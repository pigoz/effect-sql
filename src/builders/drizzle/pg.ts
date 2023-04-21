import { drizzle } from "drizzle-orm/node-postgres/driver.js";

export function queryBuilderDsl() {
  return drizzle(Symbol.for("postgres-stub") as any);
}
