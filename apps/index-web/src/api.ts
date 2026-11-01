import { Effect, Option, Predicate } from "effect";
import { HttpClient } from "effect/http";
import * as HttpApiClient from "effect/http-api/HttpApiClient";
import type { CanonicalJob } from "@job-index/domain/Job";
import { api, type JobPage } from "@job-index/worker/Api";
import type { JobsQuery } from "./route.ts";

/**
 * The typed read client: endpoints, parameters and response schemas all come
 * from the Worker's own `HttpApi` declaration, so this file cannot drift from
 * the server's contract. Only the `corpus` group is built; the client never
 * reaches a route that needs a credential. Each request requires an
 * `HttpClient`; `query.ts` provides the browser's (`Http.layer`) at the
 * Command boundary, and tests provide a stub.
 */
const corpusClient = Effect.gen(function* () {
  const httpClient = yield* HttpClient.HttpClient;
  return yield* HttpApiClient.group(api, { group: "corpus", httpClient });
});

/** The list shows current vacancies only; closed ones stay reachable by id. */
const CURRENT_STATUS = "Active";
export const PAGE_LIMIT = 50;

export const listCurrentJobs = (
  query: JobsQuery,
): Effect.Effect<JobPage, string, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* corpusClient;
    return yield* client.listJobs({
      query: {
        term: Option.getOrUndefined(query.term),
        location: Option.getOrUndefined(query.location),
        status: CURRENT_STATUS,
        limit: String(PAGE_LIMIT),
      },
    });
  }).pipe(Effect.mapError(() => "The vacancy list could not be loaded."));

export const getJob = (jobId: string): Effect.Effect<CanonicalJob, string, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* corpusClient;
    return yield* client.getJob({ params: { id: jobId } });
  }).pipe(
    Effect.mapError((error) =>
      Predicate.isTagged(error, "NotFound")
        ? "No vacancy has this id."
        : "The vacancy could not be loaded.",
    ),
  );
