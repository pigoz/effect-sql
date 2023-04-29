# effect-sql

Relational Databases with Effect!

This project aims to become a one stop shop to deal with relational databases in [Effect](https://github.com/Effect-TS).

It's composed of several decoupled pieces, from which you should be able to pick and choose whatever you want to build a "database prelude" that best fits your application.

  - `effect-sql/query` is a wrapper over Node database drivers. It provides an Effectful interface to operate with raw SQL strings and little overhead. A spiritual alternative to `effect-pg`, `effect-mysql`, and such. It includes:
    - Layer to manage the ConnectionPool using Effect's Pool
    - Query operators with tagged errors in the failure channel
    - DSL for nested transactions (using savepoints!)
    - (*Doing*): Driver based abstraction to support multiple database engines (focusing on getting PostgreSQL🐘 right initially)
    - (*Planned*): Non pooled connections (i.e. PlanetScale)
    - (*Planned*): Improved support for sandboxed database drivers

  - (*Optional*) `effect-sql/schema`: TypeScript-first schema declaration based on [Drizzle](https://github.com/drizzle-team/drizzle-orm). Features:
    - Infer Kysely database using `effect-sql/schema/kysely`.
    - (*Planned*): Derive `@effect/schema` types
    - (*Planned*): Factory system with faker or fast check

  - (*Optional*) `effect-sql/builders/*`: Query builders to create typesafe queries and to execute them. They are built on top of `effect-sql/query`
    - [Kysely](https://github.com/kysely-org/kysely): "blessed" solution
    - [Drizzle](https://github.com/drizzle-team/drizzle-orm): "toy" solution, see [Drizzle as a Query Builder](#drizzle-as-a-query-builder) in this README.

  - (*Planned*) `effect-sql/sql`: tagged template literal to build safer queries

### Raw SQL Example (minimal!)
```typescript
// app.ts
import {
  runQuery,
  runQueryOne,
  runQueryExactlyOne,
  ConnectionPool,
  ConnectionPoolScopedService,
  Driver,
} from "effect-sql/query";
import { PostgreSqlDriver } from "effect-sql/drivers/pg";

const post1 = runQuery(`select * from "posts"`);
//    ^ Effect<Driver, ConnectionPool, DatabaseError, QueryResult<UnknownRow>>

const post2 = runQueryOne(`select * from "posts" where id = 1`);
//    ^ Effect<Driver, ConnectionPool, DatabaseError | NotFound, UnknownRow>

const post3 = runQueryExactlyOne(`select * from "posts" where id = 1`);
//    ^ Effect<Driver, ConnectionPool, DatabaseError | NotFound | TooMany, UnknownRow>

const DriverLive = Layer.succeed(
  Driver,
  PostgreSqlDriver(),
);

const ConnectionPoolLive = Layer.scoped(
  ConnectionPool,
  ConnectionPoolScopedService(),
);

pipe(
  post3,
  Effect.provideLayer(pipe(
    DriverLive,
    Layer.provideMerge(ConnectionPoolLive)
  )),
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
import { InferDatabase } from "effect-sql/schema/kysely";
import { Selectable } from "kysely";

import * as schema from "./schema.ts";

interface Database extends CamelCase<InferDatabase<typeof schema>> {}
export const db = queryBuilderDsl<Database>({ useCamelCaseTransformer: true });

export interface Post extends Selectable<Database["posts"]> {}
```

```typescript
// app.ts
import {
  runQuery,
  runQueryOne,
  runQueryExactlyOne,
  KyselyQueryBuilder,
} from "effect-sql/builders/kysely";

import { transaction } from "effect-sql/query";

import { db } from "./dsl.ts";

const post1 = runQuery(db.selectFrom("posts"));
//    ^ Effect<Driver, ConnectionPool, DatabaseError, QueryResult<{ id: number, name: string }>>

const post2 = runQueryOne(db.selectFrom("posts"));
//    ^ Effect<Driver, ConnectionPool, DatabaseError | NotFound, { id: number, name: string }>

const post3 = runQueryExactlyOne(db.selectFrom("posts"));
//    ^ Effect<Driver, ConnectionPool, DatabaseError | NotFound | TooMany, { id: number, ... }>

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
  Driver,
} from "effect-sql/query";

import { MigrationLayer } from "effect-sql/schema/pg";
import { PostgreSqlDriver } from "effect-sql/drivers/pg";

const DriverLive = Layer.succeed(
  Driver,
  PostgreSqlDriver(),
);

const ConnectionPoolLive = Layer.scoped(
  ConnectionPool,
  ConnectionPoolScopedService(),
);

const MigrationLive =
  MigrationLayer(path.resolve(__dirname, "../migrations/pg"));

const QueryBuilderLive = Layer.succeed(
  KyselyQueryBuilder,
  db
);

pipe(
  post3,
  Effect.provideLayer(pipe(
    DriverLive,
    Layer.provideMerge(ConnectionPoolLive),
    Layer.provideMerge(MigrationLive),
    Layer.provideMerge(QueryBuilderLive)
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
