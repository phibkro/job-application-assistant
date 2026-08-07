import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  DraftMissing,
  EntitlementRequired,
  PolicyProhibited,
  ProfileIncomplete,
} from "@job-index/domain/Failure";
import type { Credential } from "@job-index/domain/Access";
import type { CanonicalJob } from "@job-index/domain/Job";
import type { Profile } from "@job-index/domain/Profile";
import type { CanonicalJobId, PrincipalId, ProfileId, Sequence } from "@job-index/domain/Ids";
import { Accounts, Profiles } from "../services/Accounts.ts";
import { Corpus } from "../services/Corpus.ts";
import { Drafting } from "../services/Drafting.ts";
import { Entitlements } from "../services/Entitlements.ts";
import { ApplicationMissing } from "@job-index/domain/Failure";
import { Applications } from "../services/Applications.ts";
import { SavedJobs } from "../services/SavedJobs.ts";
import { buildHandler } from "./testSupport.ts";

const alice = "alice" as ProfileId;
const authHeaders = { Authorization: "Bearer good-token" };
const post = (path: string, body: unknown) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const authedAs = (profile: ProfileId) => {
  const credential: Credential = { _tag: "Session", principal: "p1" as PrincipalId, session: "s1" };
  return Layer.succeed(Accounts, {
    authenticate: () => Effect.succeed(credential),
    profileOf: () => Effect.succeed(profile),
    requestErasure: () => Effect.die("unused"),
  });
};

const job: CanonicalJob = {
  id: "cj_1" as CanonicalJobId,
  title: "Baker",
  employerName: "Bakery AS",
  location: "Oslo",
  description: "",
  applicationUrl: "https://example.com/1",
  publishedAt: "2026-01-01T00:00:00Z",
  status: { _tag: "Active" },
  sequence: 1 as Sequence,
  changedAt: "2026-01-01T00:00:00Z",
  sources: [],
};

const blankProfile: Profile = {
  headline: "",
  summary: "",
  location: "",
  languages: "",
  skills: [],
  experience: [],
  education: [],
};

describe("applications.save", () => {
  it("404s (NotFound) when the job doesn't exist in the corpus", async () => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      corpus: Layer.succeed(Corpus, {
        observe: () => Effect.die("unused"),
        get: () => Effect.succeed(undefined),
        changedSince: () => Effect.die("unused"),
        search: () => Effect.die("unused"),
        fresh: () => Effect.die("unused"),
        markOffered: () => Effect.die("unused"),
        closeAbsent: () => Effect.die("unused"),
      }),
    });
    const res = await handler(post("/api/v1/me/saved", { jobId: "missing" }));
    expect(await res.json()).toMatchObject({ _tag: "NotFound" });
  });

  it("saves against SavedJobs.save and returns its id", async () => {
    let seen: unknown;
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      corpus: Layer.succeed(Corpus, {
        observe: () => Effect.die("unused"),
        get: () => Effect.succeed(job),
        changedSince: () => Effect.die("unused"),
        search: () => Effect.die("unused"),
        fresh: () => Effect.die("unused"),
        markOffered: () => Effect.die("unused"),
        closeAbsent: () => Effect.die("unused"),
      }),
      savedJobs: Layer.succeed(SavedJobs, {
        save: (profile, jobId, note) => {
          seen = { profile, jobId, note };
          return Effect.succeed("saved_1" as never);
        },
        resolve: () => Effect.die("unused"),
      }),
    });
    const res = await handler(post("/api/v1/me/saved", { jobId: "cj_1", note: "looks good" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ savedJobId: "saved_1" });
    expect(seen).toEqual({ profile: alice, jobId: "cj_1", note: "looks good" });
  });
});

const withResolve = (jobId: string | undefined) =>
  Layer.succeed(SavedJobs, {
    save: () => Effect.die("unused"),
    resolve: () => Effect.succeed(jobId as never),
  });

describe("applications.draft", () => {
  it("404s when the saved job is unknown to this profile", async () => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      savedJobs: withResolve(undefined),
    });
    const res = await handler(post("/api/v1/me/saved/missing/draft", {}));
    expect(await res.json()).toMatchObject({ _tag: "NotFound" });
  });

  it("404s when the saved job resolves but the live listing is gone", async () => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      savedJobs: withResolve("cj_1"),
      corpus: Layer.succeed(Corpus, {
        observe: () => Effect.die("unused"),
        get: () => Effect.succeed(undefined),
        changedSince: () => Effect.die("unused"),
        search: () => Effect.die("unused"),
        fresh: () => Effect.die("unused"),
        markOffered: () => Effect.die("unused"),
        closeAbsent: () => Effect.die("unused"),
      }),
    });
    const res = await handler(post("/api/v1/me/saved/saved_1/draft", {}));
    expect(await res.json()).toMatchObject({ _tag: "NotFound" });
  });

  it("UpgradeRequired when the model generator is requested without the entitlement", async () => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      savedJobs: withResolve("cj_1"),
      corpus: Layer.succeed(Corpus, {
        observe: () => Effect.die("unused"),
        get: () => Effect.succeed(job),
        changedSince: () => Effect.die("unused"),
        search: () => Effect.die("unused"),
        fresh: () => Effect.die("unused"),
        markOffered: () => Effect.die("unused"),
        closeAbsent: () => Effect.die("unused"),
      }),
      entitlements: Layer.succeed(Entitlements, {
        has: () => Effect.die("unused"),
        require: () => Effect.fail(new EntitlementRequired({ capability: "model-drafting" })),
      }),
    });
    const res = await handler(post("/api/v1/me/saved/saved_1/draft", { generator: "model" }));
    expect(await res.json()).toMatchObject({
      _tag: "UpgradeRequired",
      capability: "model-drafting",
    });
  });

  it("maps Drafting's ProfileIncomplete onto NotFound — the closest fit, not a clean one", async () => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      savedJobs: withResolve("cj_1"),
      corpus: Layer.succeed(Corpus, {
        observe: () => Effect.die("unused"),
        get: () => Effect.succeed(job),
        changedSince: () => Effect.die("unused"),
        search: () => Effect.die("unused"),
        fresh: () => Effect.die("unused"),
        markOffered: () => Effect.die("unused"),
        closeAbsent: () => Effect.die("unused"),
      }),
      profiles: Layer.succeed(Profiles, {
        get: () => Effect.succeed(blankProfile),
        set: () => Effect.die("unused"),
        answers: () => Effect.die("unused"),
        answer: () => Effect.die("unused"),
        unanswered: () => Effect.die("unused"),
      }),
      drafting: Layer.succeed(Drafting, {
        compose: () => Effect.fail(new ProfileIncomplete({ missing: "headline or experience" })),
      }),
    });
    const res = await handler(post("/api/v1/me/saved/saved_1/draft", {}));
    expect(await res.json()).toMatchObject({ _tag: "NotFound" });
  });

  it("returns Drafting's Documents unchanged on the happy path", async () => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      savedJobs: withResolve("cj_1"),
      corpus: Layer.succeed(Corpus, {
        observe: () => Effect.die("unused"),
        get: () => Effect.succeed(job),
        changedSince: () => Effect.die("unused"),
        search: () => Effect.die("unused"),
        fresh: () => Effect.die("unused"),
        markOffered: () => Effect.die("unused"),
        closeAbsent: () => Effect.die("unused"),
      }),
      profiles: Layer.succeed(Profiles, {
        get: () => Effect.succeed(blankProfile),
        set: () => Effect.die("unused"),
        answers: () => Effect.die("unused"),
        answer: () => Effect.die("unused"),
        unanswered: () => Effect.die("unused"),
      }),
      drafting: Layer.succeed(Drafting, {
        compose: () =>
          Effect.succeed({ cv: "CV", letter: "Letter", generator: "template" as const }),
      }),
    });
    const res = await handler(post("/api/v1/me/saved/saved_1/draft", {}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cv: "CV", letter: "Letter", generator: "template" });
  });
});

const applicationsFake = (prepare: Applications["Service"]["prepare"]) =>
  Layer.succeed(Applications, { prepare, setStatus: () => Effect.die("unused") });

describe("applications.prepare", () => {
  it("maps DraftMissing onto NotFound", async () => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      applications: applicationsFake(() => Effect.fail(new DraftMissing({ savedJob: "saved_1" }))),
    });
    const res = await handler(post("/api/v1/me/saved/saved_1/apply", {}));
    expect(await res.json()).toMatchObject({ _tag: "NotFound" });
  });

  it("maps EntitlementRequired onto UpgradeRequired, capability carried through", async () => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      applications: applicationsFake(() =>
        Effect.fail(new EntitlementRequired({ capability: "automated-apply" })),
      ),
    });
    const res = await handler(post("/api/v1/me/saved/saved_1/apply", { method: "automated" }));
    expect(await res.json()).toEqual({ _tag: "UpgradeRequired", capability: "automated-apply" });
  });

  it("maps PolicyProhibited onto ForbiddenByPlatform, platform and policy carried through", async () => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      applications: applicationsFake(() =>
        Effect.fail(new PolicyProhibited({ platform: "webcruiter", policy: "Unreviewed" })),
      ),
    });
    const res = await handler(post("/api/v1/me/saved/saved_1/apply", { method: "automated" }));
    expect(await res.json()).toEqual({
      _tag: "ForbiddenByPlatform",
      platform: "webcruiter",
      policy: "Unreviewed",
    });
  });

  it("defaults an omitted method to assisted, and maps Prepared onto the wire shape", async () => {
    let seenMethod: unknown;
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      applications: applicationsFake((_user, _savedJob, method) => {
        seenMethod = method;
        return Effect.succeed({
          application: "app_1" as never,
          method: "assisted",
          documents: { cv: "CV", letter: "Letter", generator: "template" },
          applicationUrl: "https://example.com/apply",
        });
      }),
    });
    const res = await handler(post("/api/v1/me/saved/saved_1/apply", {}));
    expect(res.status).toBe(200);
    expect(seenMethod).toBe("assisted");
    expect(await res.json()).toEqual({
      applicationId: "app_1",
      method: "assisted",
      applicationUrl: "https://example.com/apply",
      cv: "CV",
      letter: "Letter",
      downgradeReason: null,
    });
  });

  it("carries a downgradeReason through when Applications reports one", async () => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      applications: applicationsFake(() =>
        Effect.succeed({
          application: "app_1" as never,
          method: "assisted",
          documents: { cv: "CV", letter: "Letter", generator: "template" },
          applicationUrl: "https://example.com/apply",
          downgradeReason: "webcruiter automation is unreviewed",
        }),
      ),
    });
    const res = await handler(post("/api/v1/me/saved/saved_1/apply", { method: "automated" }));
    expect((await res.json()).downgradeReason).toBe("webcruiter automation is unreviewed");
  });
});

describe("applications.decide", () => {
  it.each([
    ["approve", "submitted"],
    ["decline", "withdrawn"],
    ["rework", "ready"],
  ] as const)("maps decision %s onto ApplicationStatus %s", async (decision, status) => {
    let seen: unknown;
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      applications: Layer.succeed(Applications, {
        prepare: () => Effect.die("unused"),
        setStatus: (user, applicationId, s, notes) => {
          seen = { user, applicationId, status: s, notes };
          return Effect.void;
        },
      }),
    });
    const res = await handler(post("/api/v1/me/applications/app_1/decision", { decision }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ applicationId: "app_1", status });
    expect(seen).toEqual({ user: alice, applicationId: "app_1", status, notes: "" });
  });

  it("404s a decision on an application that is not this profile's", async () => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      applications: Layer.succeed(Applications, {
        prepare: () => Effect.die("unused"),
        setStatus: (_user, applicationId) =>
          Effect.fail(new ApplicationMissing({ application: applicationId })),
      }),
    });
    const res = await handler(
      post("/api/v1/me/applications/app_missing/decision", { decision: "approve" }),
    );
    // The branch the wire had always declared and nothing could reach: before
    // `setStatus` had an error channel, mistyping an id was answered 200 with
    // a decision nobody recorded.
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ _tag: "NotFound" });
  });

  it("fails loud on a decision outside approve/rework/decline", async () => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      applications: Layer.succeed(Applications, {
        prepare: () => Effect.die("unused"),
        setStatus: () => Effect.die("should not be reached"),
      }),
    });
    const res = await handler(
      post("/api/v1/me/applications/app_1/decision", { decision: "maybe" }),
    );
    expect(res.status).not.toBe(200);
  });
});
