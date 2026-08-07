import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import type { AcquisitionTier } from "@job-index/domain/Source";
import { api, NotFound } from "../Api.ts";
import { Corpus } from "../services/Corpus.ts";
import { SourceCatalog } from "../services/SourceCatalog.ts";
import { decodeCanonicalJobId, decodeCursor, decodeLimit, nextCursorOf } from "./wire.ts";

/**
 * `listJobs`'s `term`/`location`/`status` query params have nothing to
 * filter against: `Corpus` exposes `get`, `changedSince`, `fresh`,
 * `markOffered`, `closeAbsent` — a change stream and a per-profile
 * freshness read, no full-text or field search. `changedSince` backs the
 * pagination (`cursor` is its `Sequence`, stringified); the three filters
 * are accepted and currently ignored rather than silently mis-paginated by
 * an in-memory filter that would shrink a page without adjusting `limit`.
 * See the handoff report for the fuller note.
 */
export const layer = HttpApiBuilder.group(api, "corpus", (handlers) =>
  handlers
    .handle("listJobs", ({ query }) =>
      Effect.gen(function* () {
        const corpus = yield* Corpus;
        const limit = decodeLimit(query.limit);
        const cursor = decodeCursor(query.cursor);
        const data = yield* corpus.changedSince(cursor, limit);
        return { data, meta: { limit, nextCursor: nextCursorOf(data, limit) } };
      }),
    )
    .handle("getJob", ({ params }) =>
      Effect.gen(function* () {
        const corpus = yield* Corpus;
        const job = yield* corpus.get(decodeCanonicalJobId(params.id));
        if (job === undefined) {
          return yield* Effect.fail(new NotFound({ message: `no job with id ${params.id}` }));
        }
        return job;
      }),
    )
    .handle("listSources", ({ query }) =>
      Effect.gen(function* () {
        const catalog = yield* SourceCatalog;
        const tier = tierOf(query.tier);
        const data = yield* catalog.list(tier);
        return { data };
      }),
    ),
);

/**
 * The wire's `tier` is a bare string; the domain's is a tagged union. An
 * unrecognized value is treated as "no filter" — `listSources` has no
 * declared error to reject it with (see `Api.ts`: no `error` field on this
 * endpoint at all).
 */
const tierOf = (raw: string | undefined): AcquisitionTier | undefined => {
  switch (raw) {
    case "feed":
      return { _tag: "Feed" };
    case "scripted":
      return { _tag: "Scripted" };
    case "agent":
      return { _tag: "Agent" };
    case "unknown":
      return { _tag: "Unknown" };
    default:
      return undefined;
  }
};
