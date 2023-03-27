# effect-drizzle

Integrates [drizzle-orm](https://github.com/drizzle-team/drizzle-orm) and [@effect](https://github.com/effect-ts).

⚠️ Under development, working on PostgreSQL right now. Will add SQLite and MySQL (maybe more) when the PostgreSQL API is stable.

### Example

```typescript
import { InferModel } from "drizzle-orm"
import {
  db,
  pgTable,
  serial,
  text,
  runQuery,
  runQueryOne
} from "effect-drizzle/pg"

const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  name: text("title").notNull(),
});

type Post = InferModel<typeof posts>;

const post1 = runQuery(db.select.from(posts));
//    ^ Effect<PgConnection, PgError, Post>

const post2 = runQueryOne(db.select.from(posts));
//    ^ Effect<PgConnection, PgError | RecordNotFound, Post>

const post3 = runQueryExactlyOne(db.select.from(posts));
//    ^ Effect<PgConnection, PgError | RecordNotFound | RecordsTooMany, Post>
```
