import * as Effect from "effect/Effect";
import { Database } from "../services/Database.ts";

/** The resolved `Database` shape, derived from the frozen tag — see `corpus/databaseShape.ts`. */
export type DatabaseShape = Effect.Success<typeof Database>;

/**
 * Discharges a repository call's `Database` requirement against an
 * already-resolved instance.
 *
 * Every frozen tag this slot implements (`Applications`, `Entitlements`,
 * `Policy`) promises `Effect.Effect<A, E>` with no `R` — the shell resolves
 * `Database` once, when the layer is built, the same way `corpus/index.ts`
 * and `accounts/profiles.ts` do. The repository modules in `db/repositories/`
 * are written the other way (`yield* Database` per call, for callers that
 * already run inside a `Database`-providing context), so a call to one of
 * them from inside a tag method needs this to get back to `R = never`.
 */
export const withDatabase =
  (database: DatabaseShape) =>
  <A, E>(effect: Effect.Effect<A, E, Database>): Effect.Effect<A, E> =>
    Effect.provideService(effect, Database, database);
