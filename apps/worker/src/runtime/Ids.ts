import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Ids } from "../services/Ids.ts";

/**
 * `crypto.randomUUID()` — Web Crypto, identical in Workers and Bun (see
 * `accounts/hash.ts`'s docstring) — read exactly once, here, so every other
 * module asks `Ids` instead of the ambient global directly.
 */
export const layer = Layer.succeed(Ids, { next: Effect.sync(() => crypto.randomUUID()) });
