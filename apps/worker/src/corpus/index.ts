import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Corpus } from "../services/Corpus.ts";
import { Database } from "../services/Database.ts";
import { makeChangedSince, makeGet } from "./queries.ts";
import { makeObserve } from "./observe.ts";
import { makeCloseAbsent } from "./close.ts";
import { makeFresh, makeMarkOffered } from "./freshness.ts";

export {
  normalize,
  deriveCanonicalKey,
  deriveCanonicalJobId,
  deriveOccurrenceId,
} from "./identity.ts";

/**
 * The corpus, wired to a real `Database`.
 *
 * Each method factory (`makeObserve`, `makeGet`, ...) closes over the same
 * resolved `database` instance, so every call after layer construction needs
 * nothing further from its environment — which is exactly what the frozen
 * `Corpus` tag promises: `Effect.Effect<A>` with no `R`.
 */
export const layer = Layer.effect(
  Corpus,
  Effect.gen(function* () {
    const database = yield* Database;
    return Corpus.of({
      observe: makeObserve(database),
      get: makeGet(database),
      changedSince: makeChangedSince(database),
      fresh: makeFresh(database),
      markOffered: makeMarkOffered(database),
      closeAbsent: makeCloseAbsent(database),
    });
  }),
);
