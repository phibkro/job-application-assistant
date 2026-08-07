import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import { api, CurrentPrincipal } from "../Api.ts";
import { Corpus } from "../services/Corpus.ts";
import { Judgements } from "./ports.ts";
import { decodeCanonicalJobId, decodeEnum, decodeLimit, nextCursorOf } from "./wire.ts";

/**
 * `verdict` decodes against the domain's three-way `Judgement` literal.
 * `dismiss`'s only declared error is `Unauthorized` (see `Api.ts`), so an
 * unrecognized verdict has no wire-shaped error to reject with — see
 * `wire.ts`'s `decodeEnum`.
 */
const decodeVerdict = decodeEnum("dismissed", "not_now", "irrelevant");

export const layer = HttpApiBuilder.group(api, "feed", (handlers) =>
  handlers
    .handle("fresh", ({ query }) =>
      Effect.gen(function* () {
        const corpus = yield* Corpus;
        const principal = yield* CurrentPrincipal;
        const limit = decodeLimit(query.limit);
        const data = yield* corpus.fresh(principal.profileId, limit);
        return { data, meta: { limit, nextCursor: nextCursorOf(data, limit) } };
      }),
    )
    .handle("dismiss", ({ params, payload }) =>
      Effect.gen(function* () {
        const judgements = yield* Judgements;
        const principal = yield* CurrentPrincipal;
        const jobId = decodeCanonicalJobId(params.id);
        yield* judgements.record(
          principal.profileId,
          jobId,
          decodeVerdict(payload.verdict),
          payload.reason,
        );
        return { dismissed: params.id };
      }),
    ),
);
