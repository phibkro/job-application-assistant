import * as Schema from "effect/Schema";
import * as HttpApi from "effect/unstable/httpapi/HttpApi";
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint";
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup";
import * as HttpApiMiddleware from "effect/unstable/httpapi/HttpApiMiddleware";
import * as HttpApiSecurity from "effect/unstable/httpapi/HttpApiSecurity";
import * as Context from "effect/Context";
import type { PrincipalId, ProfileId } from "@job-index/domain/Ids";
import { CanonicalJob } from "@job-index/domain/Job";
import { CatalogEntry } from "@job-index/domain/Source";
import { AnswerShape } from "@job-index/domain/Answer";
import { Profile } from "@job-index/domain/Profile";

/**
 * The contract between the worker and everything that calls it.
 *
 * This is the seam the interface, the chat surface, and any external client
 * share, so it is frozen before slots open. It also replaces three artefacts
 * that previously had to agree by hand — the router, `openapi/job-index-v1.json`,
 * and the smoke suite's assumptions about routes — because the document, a
 * typed client, and test helpers are all derived from this declaration.
 *
 * Endpoint schemas are the domain models' JSON variants, so a field marked
 * `Model.Sensitive` cannot reach a response by construction rather than by
 * review. That is the personal-data boundary made structural.
 */

/**
 * Errors carried across the wire, mirroring the domain's failure taxonomy.
 *
 * Each carries its status explicitly. Without the annotation every declared
 * error serialises as 500, whatever its name says — so an unauthenticated
 * request and a crashed handler were indistinguishable to any client that
 * reads the status line, which is most of them. The handlers slot found this
 * by running real requests through the real router, and pinned the wrong
 * behaviour in a test rather than assuming the right one; those tests now
 * assert these codes.
 *
 * Written as the `httpApiStatus` annotation rather than through
 * `HttpApiSchema.status(...)`: that helper is a schema transformer, and a
 * `TaggedError`'s third argument is an annotations object, so the helper does
 * not compose with a class declaration. The key is the one the framework
 * resolves (`resolveAt("httpApiStatus")`) and the one its own built-in errors
 * carry.
 */
export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  {
    message: Schema.String,
  },
  { httpApiStatus: 401 },
) {}

export class NotFound extends Schema.TaggedError<NotFound>()(
  "NotFound",
  {
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

/** Returned when the account's tier lacks the capability. Distinct from Forbidden. */
/** 402, not 426: the account must pay, not change protocol. */
export class UpgradeRequired extends Schema.TaggedError<UpgradeRequired>()(
  "UpgradeRequired",
  {
    capability: Schema.String,
  },
  { httpApiStatus: 402 },
) {}

/** Returned when the platform's terms forbid it, whatever the account has paid. */
export class ForbiddenByPlatform extends Schema.TaggedError<ForbiddenByPlatform>()(
  "ForbiddenByPlatform",
  { platform: Schema.String, policy: Schema.String },
  { httpApiStatus: 403 },
) {}

/**
 * Who the request is for, once the token has been checked.
 *
 * Provided by the middleware rather than re-derived per handler: an endpoint
 * that needs the caller asks for this, and one that does not cannot
 * accidentally read a profile id from a query parameter.
 */
export class CurrentPrincipal extends Context.Service<
  CurrentPrincipal,
  { readonly principalId: PrincipalId; readonly profileId: ProfileId }
>()("@job-index/CurrentPrincipal") {}

/**
 * Bearer token, checked once, in front of every group that speaks for a
 * person.
 *
 * Declared here rather than left to each handler because "did anyone check
 * the token" is not a question a reviewer should have to ask per endpoint.
 * The scheme is also what the generated OpenAPI document advertises, so the
 * document cannot claim an authentication story the code does not implement.
 *
 * A bearer token covers both callers: the interface holds a session token,
 * an API client holds a key, and both arrive the same way. What differs is
 * how they are issued, which is the accounts service's business, not the
 * wire's.
 */
export class Authenticated extends HttpApiMiddleware.Service<
  Authenticated,
  { provides: CurrentPrincipal }
>()("@job-index/Authenticated", {
  error: Unauthorized,
  security: { session: HttpApiSecurity.bearer },
}) {}

const PageMeta = Schema.Struct({
  limit: Schema.Number,
  nextCursor: Schema.NullOr(Schema.String),
});

/**
 * One page of vacancies. Exported because the interface decodes it: a second
 * hand-written copy of this shape in `apps/web` is exactly the drift that
 * having one declaration is meant to prevent.
 */
export const JobPage = Schema.Struct({
  data: Schema.Array(CanonicalJob),
  meta: PageMeta,
});

/**
 * Browsing the corpus. Unauthenticated reads stay possible so the catalogue is
 * inspectable without an account.
 */
const corpus = HttpApiGroup.make("corpus").add(
  HttpApiEndpoint.get("listJobs", "/api/v1/jobs", {
    query: {
      term: Schema.optional(Schema.String),
      location: Schema.optional(Schema.String),
      status: Schema.optional(Schema.String),
      cursor: Schema.optional(Schema.String),
      limit: Schema.optional(Schema.String),
    },
    success: JobPage,
  }),
  HttpApiEndpoint.get("getJob", "/api/v1/jobs/:id", {
    params: { id: Schema.String },
    success: CanonicalJob,
    error: NotFound,
  }),
  HttpApiEndpoint.get("listSources", "/api/v1/sources/catalog", {
    query: { tier: Schema.optional(Schema.String) },
    success: Schema.Struct({ data: Schema.Array(CatalogEntry) }),
  }),
);

/**
 * Fresh listings: what this person has not already been offered.
 *
 * Separate from `listJobs` because it is a different question — freshness is
 * per profile, so it needs the caller's identity and cannot be a query
 * parameter on a public read.
 */
const feed = HttpApiGroup.make("feed")
  .add(
    HttpApiEndpoint.get("fresh", "/api/v1/me/feed", {
      query: { limit: Schema.optional(Schema.String) },
      success: JobPage,
      error: Unauthorized,
    }),
    HttpApiEndpoint.post("dismiss", "/api/v1/me/feed/:id/dismiss", {
      params: { id: Schema.String },
      payload: Schema.Struct({ verdict: Schema.String, reason: Schema.optional(Schema.String) }),
      success: Schema.Struct({ dismissed: Schema.String }),
      error: Unauthorized,
    }),
  )
  .middleware(Authenticated);

/** The profile and its answers: everything an application is enriched from. */
const profile = HttpApiGroup.make("profile")
  .add(
    HttpApiEndpoint.get("me", "/api/v1/me", {
      success: Schema.Struct({
        profile: Profile,
        capabilities: Schema.Array(Schema.String),
      }),
      error: Unauthorized,
    }),
    HttpApiEndpoint.put("setProfile", "/api/v1/me/profile", {
      payload: Profile,
      success: Profile,
      error: Unauthorized,
    }),
    /**
     * `shape` travels with the answer because nothing else can carry it: the
     * questions come from whatever form a platform asks, and there is no
     * catalogue to look one up in. Optional, because a person answering
     * directly is answering free text — but a learned answer from an observed
     * form knows what control it came from, and without a field to say so
     * every date and choice becomes a text box forever.
     */
    HttpApiEndpoint.put("setAnswer", "/api/v1/me/answers/:question", {
      params: { question: Schema.String },
      payload: Schema.Struct({
        value: Schema.String,
        label: Schema.optional(Schema.String),
        shape: Schema.optional(AnswerShape),
      }),
      success: Schema.Struct({ question: Schema.String }),
      error: Unauthorized,
    }),
  )
  .middleware(Authenticated);

/**
 * The application loop.
 *
 * `prepare` returns what was actually done rather than what was asked: a
 * request to submit automatically may come back assisted because the platform
 * forbids it, and the caller must be able to say why. That is a success with a
 * reason, not a failure.
 */
const applications = HttpApiGroup.make("applications")
  .add(
    HttpApiEndpoint.post("save", "/api/v1/me/saved", {
      payload: Schema.Struct({ jobId: Schema.String, note: Schema.optional(Schema.String) }),
      success: Schema.Struct({ savedJobId: Schema.String }),
      error: [Unauthorized, NotFound],
    }),
    HttpApiEndpoint.post("draft", "/api/v1/me/saved/:id/draft", {
      params: { id: Schema.String },
      payload: Schema.Struct({ generator: Schema.optional(Schema.String) }),
      success: Schema.Struct({
        cv: Schema.String,
        letter: Schema.String,
        generator: Schema.String,
      }),
      error: [Unauthorized, NotFound, UpgradeRequired],
    }),
    HttpApiEndpoint.post("prepare", "/api/v1/me/saved/:id/apply", {
      params: { id: Schema.String },
      payload: Schema.Struct({ method: Schema.optional(Schema.String) }),
      success: Schema.Struct({
        applicationId: Schema.String,
        method: Schema.String,
        applicationUrl: Schema.String,
        cv: Schema.String,
        letter: Schema.String,
        downgradeReason: Schema.NullOr(Schema.String),
      }),
      error: [Unauthorized, NotFound, UpgradeRequired, ForbiddenByPlatform],
    }),
    HttpApiEndpoint.post("decide", "/api/v1/me/applications/:id/decision", {
      params: { id: Schema.String },
      /** approve · rework · decline — the human step in an automated run. */
      payload: Schema.Struct({ decision: Schema.String, notes: Schema.optional(Schema.String) }),
      success: Schema.Struct({ applicationId: Schema.String, status: Schema.String }),
      error: [Unauthorized, NotFound],
    }),
  )
  .middleware(Authenticated);

export const api = HttpApi.make("job-index").add(corpus, feed, profile, applications);
