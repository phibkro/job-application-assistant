import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { EntitlementRequired, ProfileIncomplete } from "@job-index/domain/Failure";
import type { Credential } from "@job-index/domain/Access";
import type { JobSnapshot } from "@job-index/domain/Job";
import type { ProfileId, PrincipalId } from "@job-index/domain/Ids";
import { Accounts, Profiles } from "../services/Accounts.ts";
import { TemplateStudioComposer, ModelStudioComposer } from "../services/Studio.ts";
import { Entitlements } from "../services/Entitlements.ts";
import { SavedJobs } from "../services/SavedJobs.ts";
import { Database } from "../services/Database.ts";
import { buildHandler } from "./testSupport.ts";

/**
 * WS-0018 acceptance (b), (c) route-level, (e): the entitlement matrix,
 * owner isolation on the wire, the degrade path, and the content bound.
 */

const alice = "alice" as ProfileId;
const authHeaders = { Authorization: "Bearer good-token" };

const post = (path: string, body: unknown) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const put = (path: string, body: unknown) =>
  new Request(`http://localhost${path}`, {
    method: "PUT",
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

const snapshot: JobSnapshot = {
  title: "Frontendutvikler",
  employerName: "Nordic Tech AS",
  location: "Oslo",
  description: "TypeScript og React i Oslo.",
  applicationUrl: "https://example.com/advert",
  publishedAt: "2026-08-01T00:00:00Z",
};

/** A profile rich enough for every composer to accept. */
const profile = {
  headline: "Frontend engineer",
  summary: "Eight years building interfaces.",
  location: "Oslo",
  languages: "Norwegian, English",
  skills: ["TypeScript", "React", "SQL"],
  experience: [
    {
      title: "Senior engineer",
      employer: "Nordic Tech AS",
      period: "2021–2026",
      highlights: ["Led the design-system rewrite"],
    },
  ],
  education: ["BSc Informatics, UiO"],
};

const profilesFake = Layer.succeed(Profiles, {
  get: () => Effect.succeed(profile),
  set: () => Effect.die("unused"),
  getVersioned: () => Effect.die("unused"),
  setVersioned: () => Effect.die("unused"),
  answers: () => Effect.succeed([]),
  answer: () => Effect.die("unused"),
  unanswered: () => Effect.die("unused"),
});

const blankProfile = { ...profile, headline: "", experience: [] };

const savedJobsResolve = (value: JobSnapshot | undefined) =>
  Layer.succeed(SavedJobs, {
    save: () => Effect.die("unused"),
    resolve: () => Effect.succeed(value),
    list: () => Effect.die("unused"),
  });

/** An Entitlements fake that records every consultation. */
const entitlementsFake = (grantsModelDrafting: boolean) => {
  const consulted: Array<string> = [];
  const layer = Layer.succeed(Entitlements, {
    has: (_user, capability) =>
      Effect.sync(() => {
        consulted.push(capability);
        return capability === "model-drafting" ? grantsModelDrafting : false;
      }),
    require: (_user, capability) =>
      grantsModelDrafting
        ? Effect.succeed(undefined)
        : Effect.fail(new EntitlementRequired({ capability })),
  });
  return { layer, consulted };
};

const templateComposerFake = Layer.succeed(TemplateStudioComposer, {
  compose: (profileArg, _answers, kind, job) =>
    (profileArg as { headline: string }).headline.trim() === ""
      ? Effect.fail(new ProfileIncomplete({ missing: "headline or experience" }))
      : Effect.succeed({
          kind,
          content: `template ${kind}${job === undefined ? "" : ` for ${job.title}`}`,
          engine: "template" as const,
        }),
});

const modelUnavailable = makeUnavailableLayer("model engine is not provisioned");
const modelProposing = Layer.succeed(ModelStudioComposer, {
  compose: (_profile, _answers, kind, _job) =>
    Effect.succeed({
      kind,
      content: `premium ${kind} prose`,
      engine: "model" as const,
    }),
});

function makeUnavailableLayer(reason: string) {
  return Layer.succeed(ModelStudioComposer, {
    compose: () => Effect.fail({ _tag: "StudioModelUnavailable", reason }),
  });
}

/**
 * A permissive Database fake: `run` accepts every insert (the studio's only
 * write in these tests), `query` answers "row not found" — enough for the
 * create path to complete without a live engine. Persistence round-trips
 * against a real engine are the repository test's job (workerd pool).
 */
const permissiveDatabase = () =>
  Layer.succeed(Database, {
    query: ((_sql: string) => Effect.succeed([])) as never,
    run: ((_sql: string, _bindings: ReadonlyArray<unknown>) => Effect.succeed(undefined)) as never,
    runAffected: (() => Effect.succeed(1)) as never,
    atomicAffected: (() => Effect.succeed([1])) as never,
    atomic: (() => Effect.succeed([1])) as never,
  });

describe("documents.create — entitlement matrix (WS-0018 b)", () => {
  it("the default template request returns 200 and never consults Entitlements", async () => {
    const entitlements = entitlementsFake(false);
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      profiles: profilesFake,
      savedJobs: savedJobsResolve(undefined),
      entitlements: entitlements.layer,
      templateStudioComposer: templateComposerFake,
      modelStudioComposer: modelUnavailable,
      database: permissiveDatabase(),
    });
    const res = await handler(post("/api/v1/me/documents", { kind: "cv" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { engine: string; content: string };
      downgradeReason: string | null;
    };
    expect(body.data.engine).toBe("template");
    expect(body.data.content).toBe("template cv");
    expect(body.downgradeReason).toBeNull();
    // The die-loudly default would kill the fiber on any consultation; the
    // recording fake must show none either.
    expect(entitlements.consulted).toEqual([]);
  });

  it("engine=model without the capability fails 402 with the exact body", async () => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      profiles: profilesFake,
      savedJobs: savedJobsResolve(undefined),
      entitlements: entitlementsFake(false).layer,
      templateStudioComposer: templateComposerFake,
      modelStudioComposer: modelUnavailable,
    });
    const res = await handler(post("/api/v1/me/documents", { kind: "cv", engine: "model" }));
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ _tag: "UpgradeRequired", capability: "model-drafting" });
  });

  it("entitled-but-unbound degrades to template output with a downgradeReason", async () => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      profiles: profilesFake,
      savedJobs: savedJobsResolve(undefined),
      entitlements: entitlementsFake(true).layer,
      templateStudioComposer: templateComposerFake,
      modelStudioComposer: modelUnavailable,
      database: permissiveDatabase(),
    });
    const res = await handler(post("/api/v1/me/documents", { kind: "letter", engine: "model" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { engine: string; content: string };
      downgradeReason: string | null;
    };
    expect(body.data.engine).toBe("template");
    expect(body.data.content).toBe("template letter");
    expect(body.downgradeReason).toContain("not provisioned");
  });

  it("entitled plus a working model fake marks engine=model with its prose", async () => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      profiles: profilesFake,
      savedJobs: savedJobsResolve(undefined),
      entitlements: entitlementsFake(true).layer,
      templateStudioComposer: templateComposerFake,
      modelStudioComposer: modelProposing,
      database: permissiveDatabase(),
    });
    const res = await handler(post("/api/v1/me/documents", { kind: "letter", engine: "model" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { engine: string; content: string };
      downgradeReason: string | null;
    };
    expect(body.data.engine).toBe("model");
    expect(body.data.content).toBe("premium letter prose");
    expect(body.downgradeReason).toBeNull();
  });
});

describe("documents.create — grounding (WS-0018 c/g)", () => {
  it("an unknown jobId answers NotFound and resolves through the frozen snapshot", async () => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      profiles: profilesFake,
      savedJobs: savedJobsResolve(undefined),
      templateStudioComposer: templateComposerFake,
    });
    const res = await handler(post("/api/v1/me/documents", { kind: "cv", jobId: "saved_missing" }));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { message?: string }).message).toContain("saved_missing");
  });

  it("a targeted create grounds on the resolved snapshot, not a corpus read", async () => {
    const composingFake = Layer.succeed(TemplateStudioComposer, {
      compose: (_profile, _answers, kind, job) =>
        Effect.succeed({
          kind,
          content: job === undefined ? "general" : `for ${job.title} at ${job.employerName}`,
          engine: "template" as const,
        }),
    });
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      profiles: profilesFake,
      savedJobs: savedJobsResolve(snapshot),
      templateStudioComposer: composingFake,
      database: permissiveDatabase(),
    });
    const res = await handler(post("/api/v1/me/documents", { kind: "letter", jobId: "saved_1" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { content: string; jobTitle: string | null; jobId: string | null };
    };
    expect(body.data.content).toBe("for Frontendutvikler at Nordic Tech AS");
    expect(body.data.jobTitle).toBe("Frontendutvikler");
    expect(body.data.jobId).not.toBeNull();
  });

  it("a too-empty profile maps ProfileIncomplete onto NotFound", async () => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      profiles: Layer.succeed(Profiles, {
        ...Profiles.of({} as never),
        get: () => Effect.succeed(blankProfile as never),
        answers: () => Effect.succeed([]),
      } as never),
      savedJobs: savedJobsResolve(undefined),
      templateStudioComposer: templateComposerFake,
    });
    const res = await handler(post("/api/v1/me/documents", { kind: "cv" }));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { message?: string }).message).toContain("profile is missing");
  });
});

describe("documents.updateContent — bounds and taxonomy (WS-0018 e)", () => {
  it("PUT content over the bound answers exactly 400 DocumentTooLarge", async () => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      database: permissiveDatabase(),
    });
    // The bound check fires before any id decode matters, so a placeholder
    // id keeps the fixture small; 200_001 is one char over MAX_DOCUMENT_CHARS.
    const res = await handler(
      put("/api/v1/me/documents/placeholder/content", { content: "x".repeat(200_001) }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ _tag: "DocumentTooLarge", limit: 200_000 });
  });

  it("PUT content at the bound passes the size gate (404 on the unknown id, not 400)", async () => {
    // runAffected returns 0 (nothing matched an unknown id), which is the
    // branch that proves the bound did not reject the payload.
    const db = Layer.succeed(Database, {
      query: ((_sql: string) => Effect.succeed([])) as never,
      run: ((_sql: string, _b: ReadonlyArray<unknown>) => Effect.succeed(undefined)) as never,
      runAffected: (() => Effect.succeed(0)) as never,
      atomicAffected: (() => Effect.succeed([0])) as never,
      atomic: (() => Effect.succeed([0])) as never,
    });
    const { handler } = buildHandler({ accounts: authedAs(alice), database: db });
    const res = await handler(
      put("/api/v1/me/documents/placeholder/content", { content: "x".repeat(200_000) }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ _tag: "NotFound" });
  });
});
