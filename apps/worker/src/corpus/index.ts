import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Corpus } from "../services/Corpus.ts";
import { Database } from "../services/Database.ts";
import { makeChangedSince, makeGet } from "./queries.ts";
import { makeObserve } from "./observe.ts";
import { makeCloseAbsent } from "./close.ts";
import { makeFresh, makeMarkOffered } from "./freshness.ts";
import { makeCloseEarly, makeHydrateDetail, makeOccurrenceFor } from "./hydrate.ts";
import { layer as judgementsLayer } from "./judgements.ts";
import { makeSearch } from "./search.ts";

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
const corpusLayer = Layer.effect(
  Corpus,
  Effect.gen(function* () {
    const database = yield* Database;
    return Corpus.of({
      observe: makeObserve(database),
      get: makeGet(database),
      changedSince: makeChangedSince(database),
      search: makeSearch(database),
      fresh: makeFresh(database),
      markOffered: makeMarkOffered(database),
      closeAbsent: makeCloseAbsent(database),
      occurrenceFor: makeOccurrenceFor(database),
      hydrateDetail: makeHydrateDetail(database),
      closeEarly: makeCloseEarly(database),
    });
  }),
);

/**
 * The corpus and the feedback about it. `Judgements` ships here rather than
 * in its own slot because a dismissal is the feed's answer to what the corpus
 * offered — the two are read together or not at all.
 */
export const layer = Layer.mergeAll(corpusLayer, judgementsLayer);
