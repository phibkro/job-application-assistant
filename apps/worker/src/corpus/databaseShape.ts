import type * as Effect from "effect/Effect";
import type { Database } from "../services/Database.ts";

/**
 * The resolved `Database` service shape, derived from the frozen tag rather
 * than redeclared. `Database` is itself an `Effect<Shape, never, Identifier>`
 * (see `Context.Key`), so `Effect.Success` reads its `Shape` back out — one
 * fewer hand-maintained copy of an interface this slot does not own.
 */
export type DatabaseShape = Effect.Success<typeof Database>;
