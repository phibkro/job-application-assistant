import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import type { AcquisitionTier } from "@job-index/domain/Source";
import { api, NotFound } from "../Api.ts";
import { Corpus, type JobFilter } from "../services/Corpus.ts";
import { Hydration } from "../services/Hydration.ts";
import { SourceCatalog } from "../services/SourceCatalog.ts";
import {
  decodeCanonicalJobId,
  decodeCursor,
  decodeEnum,
  decodeLimit,
  nextCursorOf,
} from "./wire.ts";

/**
 * `listJobs`'s `term`/`location`/`status` filter via `Corpus.search`; all
 * three absent (after trimming empty strings) keeps `changedSince`'s plain
 * sequence scan — the same query this endpoint already ran, so an
 * unfiltered request stays exactly as fast as before search existed. See
 * `services/Corpus.ts`'s `JobFilter` and `corpus/search.ts` for why the two
 * are separate methods and how the filter is matched.
 */
export const layer = HttpApiBuilder.group(api, "corpus", (handlers) =>
  handlers
    .handle("listJobs", ({ query }) =>
      Effect.gen(function* () {
        const corpus = yield* Corpus;
        const limit = decodeLimit(query.limit);
        const cursor = decodeCursor(query.cursor);
        const filter = decodeJobFilter(query);
        const data =
          filter === undefined
            ? yield* corpus.changedSince(cursor, limit)
            : yield* corpus.search(filter, cursor, limit);
        return { data, meta: { limit, nextCursor: nextCursorOf(data, limit) } };
      }),
    )
    // Opening a vacancy is the "someone hovered, or clicked" moment the
    // design spec's user journey describes: `hydrate` fetches its detail if
    // nothing has yet, and is a no-op (a plain `Corpus.get`, in effect) for
    // one that already has it. A failed fetch is not surfaced as a wire
    // error — `getJob` still returns whatever the corpus has, unhydrated —
    // because "opening" must stay resilient to one flaky detail fetch; see
    // `Hydration`'s own doc comment for why `save` (the loud-failure path,
    // falsifier 6) is different.
    .handle("getJob", ({ params }) =>
      Effect.gen(function* () {
        const hydration = yield* Hydration;
        const job = yield* hydration.hydrate(decodeCanonicalJobId(params.id));
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

const decodeStatus = decodeEnum("Active", "Closed");

/** `""` and `undefined` both mean "not given"; a trimmed empty term is not a query. */
const nonEmpty = (raw: string | undefined): string | undefined => {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
};

/**
 * `undefined` when `term`/`location`/`status` are all absent — the caller
 * checks this to choose `changedSince` over `search`. `status` is decoded
 * only when present: absent means "no filter", same as `term`/`location`,
 * but a *present, unrecognized* value fails loudly via `decodeEnum` rather
 * than silently matching everything, since `listJobs` declares no error to
 * reject it with instead (see `Api.ts`).
 */
const decodeJobFilter = (query: {
  readonly term?: string;
  readonly location?: string;
  readonly status?: string;
}): JobFilter | undefined => {
  const term = nonEmpty(query.term);
  const location = nonEmpty(query.location);
  const status = query.status === undefined ? undefined : decodeStatus(query.status);
  return term === undefined && location === undefined && status === undefined
    ? undefined
    : { term, location, status };
};

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
