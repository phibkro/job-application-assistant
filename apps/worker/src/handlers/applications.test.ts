import { describe, expect, it } from "vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  ApplicationMissing,
  CustomLabelMissing,
  DraftMissing,
  EntitlementRequired,
  InvalidApplicationTransition as DomainInvalidApplicationTransition,
  LabelNameConflict,
  PolicyProhibited,
  ProfileIncomplete,
  ReservedLabelMutation as DomainReservedLabelMutation,
  SavedJobMissing,
  StaleApplicationUpdate as DomainStaleApplicationUpdate,
} from "@job-index/domain/Failure";
import type { Credential } from "@job-index/domain/Access";
import { CustomLabel } from "@job-index/domain/Applications";
import { snapshotOf } from "@job-index/domain/Job";
import type { HydratedCanonicalJob, JobSnapshot } from "@job-index/domain/Job";
import type { Profile } from "@job-index/domain/Profile";
import type {
  CanonicalJobId,
  CustomLabelId,
  PrincipalId,
  ProfileId,
  Sequence,
} from "@job-index/domain/Ids";
import { Accounts, Profiles } from "../services/Accounts.ts";
import { Drafting } from "../services/Drafting.ts";
import { Entitlements } from "../services/Entitlements.ts";
import { Applications } from "../services/Applications.ts";
import { Hydration } from "../services/Hydration.ts";
import { Saved } from "../services/Saved.ts";
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

const get = (path: string) =>
  new Request(`http://localhost${path}`, {
    method: "GET",
    headers: authHeaders,
  });

const patch = (path: string, body: unknown) =>
  new Request(`http://localhost${path}`, {
    method: "PATCH",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const put = (path: string, body: unknown) =>
  new Request(`http://localhost${path}`, {
    method: "PUT",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const del = (path: string) =>
  new Request(`http://localhost${path}`, {
    method: "DELETE",
    headers: authHeaders,
  });

const savedFake = (overrides: Partial<Saved["Service"]> = {}) =>
  Layer.succeed(Saved, {
    list: () => Effect.die("unused"),
    labels: () => Effect.die("unused"),
    createLabel: () => Effect.die("unused"),
    renameLabel: () => Effect.die("unused"),
    deleteLabel: () => Effect.die("unused"),
    setLabels: () => Effect.die("unused"),
    ...overrides,
  });

const authedAs = (profile: ProfileId) => {
  const credential: Credential = { _tag: "Session", principal: "p1" as PrincipalId, session: "s1" };
  return Layer.succeed(Accounts, {
    authenticate: () => Effect.succeed(credential),
    profileOf: () => Effect.succeed(profile),
    requestErasure: () => Effect.die("unused"),
  });
};
const labelAt = (id: string, name: string) => {
  const now = DateTime.nowUnsafe();
  const normalizedName = name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  return new CustomLabel({
    id: id as CustomLabelId,
    profileId: alice,
    name,
    normalizedName,
    createdAt: now,
    updatedAt: now,
  });
};

const job: HydratedCanonicalJob = {
  id: "cj_1" as CanonicalJobId,
  title: "Baker",
  employerName: "Bakery AS",
  location: "Oslo",
  applicationUrl: "https://example.com/1",
  publishedAt: "2026-01-01T00:00:00Z",
  status: { _tag: "Active" },
  sequence: 1 as Sequence,
  changedAt: "2026-01-01T00:00:00Z",
  sources: [],
  hydration: { _tag: "Hydrated", description: "" },
};

const jobSnapshot: JobSnapshot = snapshotOf(job);

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
  it("404s (NotFound) when Hydration.hydrate finds no such job", async () => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      hydration: Layer.succeed(Hydration, { hydrate: () => Effect.succeed(undefined) }),
    });
    const res = await handler(post("/api/v1/me/saved", { jobId: "missing" }));
    expect(await res.json()).toMatchObject({ _tag: "NotFound" });
  });

  it("404s (NotFound) when hydration never completed — falsifier 6, fail loud rather than snapshot a blank description", async () => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      hydration: Layer.succeed(Hydration, {
        hydrate: () => Effect.succeed({ ...job, hydration: { _tag: "Unhydrated" } }),
      }),
    });
    const res = await handler(post("/api/v1/me/saved", { jobId: "cj_1" }));
    expect(await res.json()).toMatchObject({ _tag: "NotFound" });
  });

  it("saves against SavedJobs.save and returns its id", async () => {
    let seen: unknown;
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      hydration: Layer.succeed(Hydration, { hydrate: () => Effect.succeed(job) }),
      savedJobs: Layer.succeed(SavedJobs, {
        save: (profile, savedJob, note) => {
          // `save` now takes the whole job, not just its id — captures the
          // id back out so the assertion below stays about the wire
          // contract (which job id was saved), not the new argument shape.
          seen = { profile, jobId: savedJob.id, note };
          return Effect.succeed("saved_1" as never);
        },
        resolve: () => Effect.die("unused"),
        list: () => Effect.die("unused"),
      }),
    });
    const res = await handler(post("/api/v1/me/saved", { jobId: "cj_1", note: "looks good" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ savedJobId: "saved_1" });
    expect(seen).toEqual({ profile: alice, jobId: "cj_1", note: "looks good" });
  });
});

const withResolve = (snapshot: JobSnapshot | undefined) =>
  Layer.succeed(SavedJobs, {
    save: () => Effect.die("unused"),
    resolve: () => Effect.succeed(snapshot),
    list: () => Effect.die("unused"),
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

  // There used to be a case here for "the saved job resolves but the live
  // listing is gone" — `draft` called `Corpus.get` after `resolve` and could
  // 404 on a bookmark whose corpus row had moved on. That branch cannot
  // exist anymore: `resolve` now answers with the saved job's own frozen
  // snapshot, which is present whenever the saved job is, so there is
  // nothing left to be missing (the operator's decision this change makes
  // structural — see `Applications.ts`'s `SavedJob` docstring).

  it("UpgradeRequired when the model generator is requested without the entitlement", async () => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      savedJobs: withResolve(jobSnapshot),
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
      savedJobs: withResolve(jobSnapshot),
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
      savedJobs: withResolve(jobSnapshot),
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
  Layer.succeed(Applications, {
    prepare,
    recordEvent: () => Effect.die("unused"),
    setStatus: () => Effect.die("unused"),
    historyForSaved: () => Effect.die("unused"),
    history: () => Effect.die("unused"),
  });

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
    ["approve", "ready"],
    ["decline", "withdrawn"],
    ["rework", "ready"],
  ] as const)("maps decision %s onto ApplicationStatus %s", async (decision, status) => {
    let seen: unknown;
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      applications: Layer.succeed(Applications, {
        prepare: () => Effect.die("unused"),
        recordEvent: () => Effect.die("unused"),
        setStatus: (user, applicationId, s, notes) => {
          seen = { user, applicationId, status: s, notes };
          return Effect.void;
        },
        historyForSaved: () => Effect.die("unused"),
        history: () => Effect.die("unused"),
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
        recordEvent: () => Effect.die("unused"),
        setStatus: (_user, applicationId) =>
          Effect.fail(new ApplicationMissing({ application: applicationId })),
        historyForSaved: () => Effect.die("unused"),
        history: () => Effect.die("unused"),
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
        recordEvent: () => Effect.die("unused"),
        setStatus: () => Effect.die("should not be reached"),
        historyForSaved: () => Effect.die("unused"),
        history: () => Effect.die("unused"),
      }),
    });
    const res = await handler(
      post("/api/v1/me/applications/app_1/decision", { decision: "maybe" }),
    );
    expect(res.status).not.toBe(200);
  });
});

describe("applications.history", () => {
  it("returns owner-scoped saved application history with current marker", async () => {
    let seenOwner: unknown;
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      applications: Layer.succeed(Applications, {
        prepare: () => Effect.die("unused"),
        recordEvent: () => Effect.die("unused"),
        setStatus: () => Effect.die("unused"),
        historyForSaved: (profile, savedJob) => {
          seenOwner = { profile, savedJob };
          return Effect.succeed([
            {
              applicationId: "app-1" as never,
              status: "submitted" as const,
              method: "assisted" as const,
              applicationUrl: "https://example.invalid/apply",
              notes: "Confirmed",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-02T00:00:00.000Z",
              isCurrent: true,
            },
          ]);
        },
        history: () => Effect.die("unused"),
      }),
    });
    const res = await handler(get("/api/v1/me/saved/saved-1/applications"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: [
        {
          applicationId: "app-1",
          status: "submitted",
          method: "assisted",
          applicationUrl: "https://example.invalid/apply",
          notes: "Confirmed",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
          isCurrent: true,
        },
      ],
    });
    expect(seenOwner).toEqual({ profile: alice, savedJob: "saved-1" });
  });

  it("maps an unowned saved vacancy to NotFound", async () => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      applications: Layer.succeed(Applications, {
        prepare: () => Effect.die("unused"),
        recordEvent: () => Effect.die("unused"),
        setStatus: () => Effect.die("unused"),
        historyForSaved: () => Effect.fail(new SavedJobMissing({ savedJob: "foreign" as never })),
        history: () => Effect.die("unused"),
      }),
    });
    const res = await handler(get("/api/v1/me/saved/foreign/applications"));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ _tag: "NotFound" });
  });
});

describe("applications.saved", () => {
  it("forwards saved view, sort, cursor, and custom-label filters", async () => {
    let seen: unknown;
    const page = { data: [], meta: { limit: 50, nextCursor: null } };
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      saved: savedFake({
        list: (profile, query) => {
          seen = { profile, query };
          return Effect.succeed(page);
        },
      }),
    });

    const res = await handler(
      get("/api/v1/me/saved?view=closed&sort=deadline-soon&cursor=50&label=label-1"),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(page);
    expect(seen).toEqual({
      profile: alice,
      query: {
        view: "closed",
        sort: "deadline-soon",
        cursor: "50",
        label: "label-1",
      },
    });
  });

  it("defaults saved list requests to all and recently-saved", async () => {
    let seen: unknown;
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      saved: savedFake({
        list: (profile, query) => {
          seen = { profile, query };
          return Effect.succeed({ data: [], meta: { limit: 50, nextCursor: null } });
        },
      }),
    });

    const res = await handler(get("/api/v1/me/saved"));

    expect(res.status).toBe(200);
    expect(seen).toEqual({
      profile: alice,
      query: {
        view: "all",
        sort: "recently-saved",
        cursor: undefined,
        label: undefined,
      },
    });
  });

  it("lists custom labels using the wire date representation", async () => {
    const first = labelAt("label-1", "Work Leads");
    const second = labelAt("label-2", "Follow Up");
    let seenProfile: unknown;
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      saved: savedFake({
        labels: (profile) => {
          seenProfile = profile;
          return Effect.succeed([first, second]);
        },
      }),
    });

    const res = await handler(get("/api/v1/me/saved/labels"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: [
        {
          id: "label-1",
          name: "Work Leads",
          normalizedName: "work leads",
          createdAt: DateTime.formatIso(first.createdAt),
          updatedAt: DateTime.formatIso(first.updatedAt),
        },
        {
          id: "label-2",
          name: "Follow Up",
          normalizedName: "follow up",
          createdAt: DateTime.formatIso(second.createdAt),
          updatedAt: DateTime.formatIso(second.updatedAt),
        },
      ],
    });
    expect(seenProfile).toBe(alice);
  });

  it("creates a custom label and returns its normalized fields", async () => {
    const created = labelAt("label-1", "Work Leads");
    let seen: unknown;
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      saved: savedFake({
        createLabel: (profile, name) => {
          seen = { profile, name };
          return Effect.succeed(created);
        },
      }),
    });

    const res = await handler(post("/api/v1/me/saved/labels", { name: "Work Leads" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "label-1",
      name: "Work Leads",
      normalizedName: "work leads",
      createdAt: DateTime.formatIso(created.createdAt),
      updatedAt: DateTime.formatIso(created.updatedAt),
    });
    expect(seen).toEqual({ profile: alice, name: "Work Leads" });
  });

  it.each([
    [
      "normalized conflict",
      () => new LabelNameConflict({ name: "wORK", normalizedName: "work" }),
      409,
      { _tag: "LabelConflict", name: "wORK", normalizedName: "work" },
    ],
    [
      "reserved name",
      () => new DomainReservedLabelMutation({ name: "SAVED" }),
      400,
      { _tag: "ReservedLabelMutation", name: "SAVED" },
    ],
  ] as const)(
    "maps createSavedLabel %s to its typed status",
    async (_case, failure, status, body) => {
      const { handler } = buildHandler({
        accounts: authedAs(alice),
        saved: savedFake({ createLabel: () => Effect.fail(failure()) }),
      });

      const res = await handler(post("/api/v1/me/saved/labels", { name: "SAVED" }));

      expect(res.status).toBe(status);
      expect(await res.json()).toMatchObject(body);
    },
  );

  it("renames a custom label and preserves the owner boundary", async () => {
    const renamed = labelAt("label-1", "Work Leads");
    let seen: unknown;
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      saved: savedFake({
        renameLabel: (profile, label, name) => {
          seen = { profile, label, name };
          return Effect.succeed(renamed);
        },
      }),
    });

    const res = await handler(patch("/api/v1/me/saved/labels/label-1", { name: "Work Leads" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "label-1",
      name: "Work Leads",
      normalizedName: "work leads",
      createdAt: DateTime.formatIso(renamed.createdAt),
      updatedAt: DateTime.formatIso(renamed.updatedAt),
    });
    expect(seen).toEqual({ profile: alice, label: "label-1", name: "Work Leads" });
  });

  it.each([
    [
      "missing label",
      () => new CustomLabelMissing({ label: "foreign" }),
      404,
      { _tag: "NotFound" },
    ],
    [
      "normalized conflict",
      () => new LabelNameConflict({ name: "beta", normalizedName: "beta" }),
      409,
      { _tag: "LabelConflict", name: "beta", normalizedName: "beta" },
    ],
    [
      "reserved name",
      () => new DomainReservedLabelMutation({ name: "CLOSED" }),
      400,
      { _tag: "ReservedLabelMutation", name: "CLOSED" },
    ],
  ] as const)(
    "maps renameSavedLabel %s to its typed status",
    async (_case, failure, status, body) => {
      const { handler } = buildHandler({
        accounts: authedAs(alice),
        saved: savedFake({ renameLabel: () => Effect.fail(failure()) }),
      });

      const res = await handler(patch("/api/v1/me/saved/labels/label-1", { name: "CLOSED" }));

      expect(res.status).toBe(status);
      expect(await res.json()).toMatchObject(body);
    },
  );

  it("deletes an owned custom label and returns the requested id", async () => {
    let seen: unknown;
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      saved: savedFake({
        deleteLabel: (profile, label) => {
          seen = { profile, label };
          return Effect.void;
        },
      }),
    });

    const res = await handler(del("/api/v1/me/saved/labels/label-1"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: "label-1" });
    expect(seen).toEqual({ profile: alice, label: "label-1" });
  });

  it("maps deleting an unowned custom label to NotFound", async () => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      saved: savedFake({
        deleteLabel: () => Effect.fail(new CustomLabelMissing({ label: "foreign" })),
      }),
    });

    const res = await handler(del("/api/v1/me/saved/labels/foreign"));

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ _tag: "NotFound" });
  });

  it("replaces saved-job labels and returns the owner-scoped assignment", async () => {
    let seen: unknown;
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      saved: savedFake({
        setLabels: (profile, savedJob, labelIds) => {
          seen = { profile, savedJob, labelIds };
          return Effect.void;
        },
      }),
    });

    const res = await handler(
      put("/api/v1/me/saved/saved-1/labels", { labelIds: ["label-1", "label-2"] }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      savedJobId: "saved-1",
      labelIds: ["label-1", "label-2"],
    });
    expect(seen).toEqual({
      profile: alice,
      savedJob: "saved-1",
      labelIds: ["label-1", "label-2"],
    });
  });

  it.each([
    ["missing saved job", () => new SavedJobMissing({ savedJob: "foreign" }), 404],
    ["missing label", () => new CustomLabelMissing({ label: "foreign-label" }), 404],
    ["reserved label", () => new DomainReservedLabelMutation({ name: "saved" }), 400],
  ] as const)("maps setSavedLabels %s to its typed status", async (_case, failure, status) => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      saved: savedFake({ setLabels: () => Effect.fail(failure()) }),
    });

    const res = await handler(put("/api/v1/me/saved/saved-1/labels", { labelIds: ["label-1"] }));

    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({
      _tag: status === 400 ? "ReservedLabelMutation" : "NotFound",
    });
  });
});

describe("applications.events", () => {
  it("forwards optional notes and the optimistic concurrency token", async () => {
    const seen: Array<unknown> = [];
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      applications: Layer.succeed(Applications, {
        prepare: () => Effect.die("unused"),
        recordEvent: (profile, application, event, notes, expectedUpdatedAt) => {
          seen.push({ profile, application, event, notes, expectedUpdatedAt });
          return Effect.succeed({
            applicationId: "app-1" as never,
            status: "submitted" as const,
            updatedAt: "2026-01-03T00:00:00.000Z",
          });
        },
        setStatus: () => Effect.die("unused"),
        historyForSaved: () => Effect.die("unused"),
        history: () => Effect.die("unused"),
      }),
    });

    const withNotes = await handler(
      post("/api/v1/me/applications/app-1/events", {
        event: "confirm-submission",
        notes: "Sent",
        expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
      }),
    );
    const withoutNotes = await handler(
      post("/api/v1/me/applications/app-1/events", {
        event: "confirm-submission",
        expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
      }),
    );

    expect(withNotes.status).toBe(200);
    expect(await withNotes.json()).toEqual({
      applicationId: "app-1",
      status: "submitted",
      updatedAt: "2026-01-03T00:00:00.000Z",
    });
    expect(withoutNotes.status).toBe(200);
    expect(seen).toEqual([
      {
        profile: alice,
        application: "app-1",
        event: "confirm-submission",
        notes: "Sent",
        expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
      },
      {
        profile: alice,
        application: "app-1",
        event: "confirm-submission",
        notes: undefined,
        expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
  });

  it.each([
    [
      "foreign application",
      () => new ApplicationMissing({ application: "foreign" }),
      404,
      { _tag: "NotFound" },
    ],
    [
      "invalid transition",
      () =>
        new DomainInvalidApplicationTransition({
          application: "app-1",
          currentStatus: "ready",
          event: "record-interview",
          reason: "confirm submission first",
        }),
      409,
      {
        _tag: "InvalidApplicationTransition",
        applicationId: "app-1",
        currentStatus: "ready",
        event: "record-interview",
        reason: "confirm submission first",
      },
    ],
    [
      "stale update",
      () =>
        new DomainStaleApplicationUpdate({
          application: "app-1",
          expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
          actualUpdatedAt: "2026-01-02T00:00:00.000Z",
        }),
      409,
      {
        _tag: "StaleApplicationUpdate",
        applicationId: "app-1",
        expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
        actualUpdatedAt: "2026-01-02T00:00:00.000Z",
      },
    ],
  ] as const)(
    "maps %s event failures to their typed statuses",
    async (_case, failure, status, body) => {
      const { handler } = buildHandler({
        accounts: authedAs(alice),
        applications: Layer.succeed(Applications, {
          prepare: () => Effect.die("unused"),
          recordEvent: () => Effect.fail(failure()),
          setStatus: () => Effect.die("unused"),
          historyForSaved: () => Effect.die("unused"),
          history: () => Effect.die("unused"),
        }),
      });

      const res = await handler(
        post("/api/v1/me/applications/app-1/events", {
          event: "record-interview",
          expectedUpdatedAt: "2026-01-02T00:00:00.000Z",
        }),
      );

      expect(res.status).toBe(status);
      expect(await res.json()).toMatchObject(body);
    },
  );
});
