import * as Effect from "@effect/io/Effect";
import * as Context from "@effect/data/Context";
import * as Data from "@effect/data/Data";
import * as Option from "@effect/data/Option";
import { pipe } from "@effect/data/Function";

export interface DependencyProvider extends Data.Case {
  _tag: "DependencyProvider";
  get: () => Effect.Effect<never, never, Option.Option<number>>;
  set: (number) => Effect.Effect<never, never, void>;
}

export interface LazyDependency extends Data.Case {
  _tag: "LazyDependency";
  value: number;
}

export const LazyDependency = Context.Tag<LazyDependency>();

const LazyDependencyService = Data.tagged<LazyDependency>("LazyDependency");

const program = pipe(
  Effect.contextWithEffect((context: Context.Context<never>) =>
    Context.getOption(context, LazyDependency)
  ),
  Effect.catchTag("NoSuchElementException", () =>
    Effect.succeed(LazyDependencyService({ value: 1 }))
  ),
  Effect.flatMap((dependency) =>
    Effect.sync(() => console.log("%o", dependency))
  )
);

const provider = Effect.unit(); // ??

Effect.all(provider(Effect.all(program, program, program)), program);
