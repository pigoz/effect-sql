# effect-sql

Relational Databases with Effect!

This project is trying to become a one stop shop to deal with databases in [Effect](https://github.com/Effect-TS).

It's composed of several decoupled pieces, from which you should be able to pick and choose whatever you want.

  - `effect-sql/query` is a wrapper over Node database drivers. It provides an Effectful interface to operate with raw SQL strings and little overhead. A spiritual alternative to `effect-pg`, `effect-mysql`, and such. It includes:
    - Layer to manage the ConnectionPool using Effect's Pool
    - Query operators with tagged errors in the failure channel
    - DSL for nested transactions (using savepoints!)
    - (*Planned*): Driver based abstraction to support multiple database engines (⚠️focusing on getting PostgreSQL right initially)
    - (*Planned*): Non pooled connections (i.e. PlanetScale)

  - `effect-sql/schema`: (*optional*) TypeScript-first schema declaration based on [Drizzle](https://github.com/drizzle-team/drizzle-orm). Features:
    - Infer Kysely database using `effect-sql/schema/kysely`.
    - (*Planned*): Derive `@effect/schema` types
    - (*Planned*): Derive fast check arbitraries

  - `effect-sql/builders/*`: (*optional*) Query builders to create typesafe queries and to execute them. They are built on top of `effect-sql/query`
    - [Kysely](https://github.com/kysely-org/kysely): "blessed" solution
    - [Drizzle](https://github.com/drizzle-team/drizzle-orm): "toy" solution, see [Drizzle as a Query Builder](#drizzle-as-a-query-builder) in this README.

### Raw SQL Example (minimal!)
```typescript
// app.ts
import {
  runQuery,
  runQueryOne,
  runQueryExactlyOne,
  ConnectionPool,
  ConnectionPoolScopedService,
} from "effect-sql/query";

const post1 = runQuery(`select * from "posts"`);
//    ^ Effect<ConnectionPool, DatabaseError, QueryResult<UnknownRow>>

const post2 = runQueryOne(`select * from "posts" where id = 1`);
//    ^ Effect<ConnectionPool, DatabaseError | NotFound, UnknownRow>

const post3 = runQueryExactlyOne(`select * from "posts" where id = 1`);
//    ^ Effect<ConnectionPool, DatabaseError | NotFound | TooMany, UnknownRow>

const ConnectionPoolLive = Layer.scoped(
  ConnectionPool,
  ConnectionPoolScopedService(),
);

pipe(
  post3,
  Effect.provideLayer(ConnectionPoolLive)
  Effect.runFork
);
```

### Full Example (Schema + Query Builder + Camelization)

```typescript
// schema.ts
import { pgTable, serial, text } from "effect-sql/schema/pg"

const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
});
```

```typescript
// dsl.ts
import { queryBuilderDsl } from "effect-sql/builders/kysely/pg";
import { InferDatabaseFromConfig } from "effect-sql/schema/kysely";
import { Selectable } from "kysely";

import * as schema from "./schema.ts";

const config = { useCamelCaseTransformer: true };
interface Database
  extends InferDatabaseFromConfig<typeof schema, typeof config> {}
export const db = queryBuilderDsl<Database>(config);

export interface Post extends Selectable<Database["posts"]> {}
```

```typescript
// app.ts
import {
  runQuery,
  runQueryOne,
  runQueryExactlyOne,
} from "effect-sql/builders/kysely";

import { transaction } from "effect-sql/query";

import { db } from "./dsl.ts";

const post1 = runQuery(db.selectFrom("posts"));
//    ^ Effect<ConnectionPool, DatabaseError, QueryResult<{ id: number, name: string }>>

const post2 = runQueryOne(db.selectFrom("posts"));
//    ^ Effect<ConnectionPool, DatabaseError | NotFound, { id: number, name: string }>

const post3 = runQueryExactlyOne(db.selectFrom("posts"));
//    ^ Effect<ConnectionPool, DatabaseError | NotFound | TooMany, { id: number, name: string }>

transaction(Effect.all(
  db.insertInto('posts').values({ title: 'Solvet saeclum' }),
  transaction(Effect.all(
    db.insertInto('posts').values({ title: 'in favilla' }),
    db.insertInto('posts').values({ title: 'Teste David cum Sibylla' }),
  )),
))

import {
  ConnectionPool,
  ConnectionPoolScopedService,
  AfterQueryHook,
  afterQueryHook
} from "effect-sql/query";

const ConnectionPoolLive = Layer.scoped(
  ConnectionPool,
  ConnectionPoolScopedService(),
);

// Hook that picks up the useCamelCaseTransformer configuration option
// used above and handles camelization of QueryResult rows
const AfterQueryHookLive = Layer.succeed(
  AfterQueryHook,
  afterQueryHook({ hook: (x) => db.transformResultSync(x) })
);

pipe(
  post3,
  Effect.provideLayer(
    Effect.provideMerge(
      ConnectionPoolLive,
      AfterQueryHookLive
    )),
  Effect.runFork
)
```


[Please check the tests for more complete examples!](https://github.com/pigoz/effect-sql/tree/main/test)

#### Drizzle as a Query Builder

Using Drizzle as a Query Builder is possible, but currently not recommended as
it doesn't correctly map field names. For example:

```typescript
  db.select({ cityName: cities.name }).from(cities)
```

Will return `{ name: 'New York' }` instead of the expected `{ cityName: 'New York' }`.

The reason being, instead of converting the above example to the expected SQL:

```sql
select "name" as "cityName" from "cities"
```

Drizzle generates a simplified query to fetch raw arrays from the database,
and uses custom logic to assign the correct field names when it turns those
arrays into JS objects [details here!](https://discord.com/channels/1043890932593987624/1093581666666156043)

The pluggable query builder feature is there to force the internal
implementation of effect-sql to be as modular as possibile.
