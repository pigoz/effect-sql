import * as Effect from "@effect/io/Effect";
import * as Context from "@effect/data/Context";

export function optionalService<T, S>(tag: Context.Tag<T, S>) {
  return Effect.contextWithEffect((context: Context.Context<never>) =>
    Context.getOption(context, tag)
  );
}
