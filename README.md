# effect-sql

SQL Databases with Effect!

This project is a mashup of a few fantastic libraries to handle SQL databases
in TypeScript.

  - [Drizzle](https://github.com/drizzle-team/drizzle-orm) for TypeScript-first
    schema declaration (and migrations!)
  - [Kysely](https://github.com/kysely-org/kysely) as a Query Builder

  - Custom code to make the Effect experience as nice as possible:
    - Layer to manage the ConnectionPool
    - Layer to run migrations (of course this is opt-in)
    - Query operators with tagged errors in the failure channel
    - DSL for nested transactions (using savepoints!)

⚠️ Under development, working on PostgreSQL (and dogfooding) right now.
  Will add SQLite and MySQL when the PostgreSQL API is stable.

### Example

```typescript
// schema.ts
import { pgTable, serial, text } from "effect-sql/pg/schema"

const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
});
```

```typescript
// dsl.ts
import { InferDatabase, createQueryDsl } from "effect-sql/pg/schema/kysely";
import { Selectable } from "kysely";

import * as schema from "./schema.ts";

export const db = queryBuilderDsl(schema, { useCamelCaseTransformer: true });
interface Database extends InferDatabase<typeof db> {}

export interface Post extends Selectable<Database["posts"]> {}
```

```typescript
// app.ts
import {
  runQuery,
  runQueryOne,
  runQueryExactlyOne,
  transaction
} from "effect-sql/pg";

import { db } from "./dsl.ts";

const post1 = runQuery(db.selectFrom("posts"));
//    ^ Effect<ConnectionPool, DatabaseError, { id: number, name: string }>

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

import { ConnectionPool, ConnectionPoolScopedService } from "effect-sql/pg";

const ConnectionPoolLive = Layer.scoped(
  ConnectionPool,

  // transformer picks up on the useCamelCaseTransformer configuration option
  // used above and handles camelization of query results
  ConnectionPoolScopedService({ transformer: db })
);

pipe(
  post3,
  Effect.provideLayer(ConnectionPoolLive),
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
