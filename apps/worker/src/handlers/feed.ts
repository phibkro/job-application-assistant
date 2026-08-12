import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import { matchedJob, rankMatchedJobs } from "@job-index/domain/Match";
import { api, CurrentPrincipal, NotFound } from "../Api.ts";
import { Corpus } from "../services/Corpus.ts";
import { Hydration } from "../services/Hydration.ts";
import { Profiles } from "../services/Accounts.ts";
import { Judgements } from "../services/Judgements.ts";
import { decodeCanonicalJobId, decodeEnum, decodeLimit } from "./wire.ts";

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
        const profiles = yield* Profiles;
        const principal = yield* CurrentPrincipal;
        const limit = decodeLimit(query.limit);
        const profile = yield* profiles.get(principal.profileId);
        const candidates = yield* corpus.fresh(principal.profileId, 100);
        const data = rankMatchedJobs(
          candidates
            .filter((job) => job.status._tag === "Active")
            .map((job) => matchedJob(profile, job))
            .filter((item): item is NonNullable<typeof item> => item !== undefined),
        ).slice(0, limit);
        return { data, meta: { limit, nextCursor: null } };
      }),
    )
    .handle("getMatch", ({ params }) =>
      Effect.gen(function* () {
        const hydration = yield* Hydration;
        const profiles = yield* Profiles;
        const principal = yield* CurrentPrincipal;
        const id = decodeCanonicalJobId(params.id);
        const job = yield* hydration.hydrate(id);
        if (job === undefined || job.status._tag !== "Active") {
          return yield* Effect.fail(
            new NotFound({ message: `no active job with id ${params.id}` }),
          );
        }
        const profile = yield* profiles.get(principal.profileId);
        const result = matchedJob(profile, job);
        if (result === undefined) {
          return yield* Effect.fail(new NotFound({ message: `job ${params.id} is excluded` }));
        }
        return result;
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
