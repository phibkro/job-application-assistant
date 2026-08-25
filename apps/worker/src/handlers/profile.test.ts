import { describe, expect, it } from "vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { ApplicationRecord, SavedJob } from "@job-index/domain/Applications";
import type { Credential } from "@job-index/domain/Access";
import type { JobSnapshot } from "@job-index/domain/Job";
import type { Profile } from "@job-index/domain/Profile";
import type { PrincipalId, ProfileId } from "@job-index/domain/Ids";
import { Accounts, Profiles, StaleProfileWrite } from "../services/Accounts.ts";
import { Applications } from "../services/Applications.ts";
import { Entitlements } from "../services/Entitlements.ts";
import { Database } from "../services/Database.ts";
import { Extraction } from "../services/Extraction.ts";
import { HeuristicInference } from "../services/Inference.ts";
import { SavedJobs } from "../services/SavedJobs.ts";
import { buildHandler } from "./testSupport.ts";

const alice = "alice" as ProfileId;
const authHeaders = { Authorization: "Bearer good-token" };

const authedAs = (profile: ProfileId) => {
  const credential: Credential = { _tag: "Session", principal: "p1" as PrincipalId, session: "s1" };
  return Layer.succeed(Accounts, {
    authenticate: () => Effect.succeed(credential),
    profileOf: () => Effect.succeed(profile),
    requestErasure: () => Effect.die("unused"),
  });
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

const proposalDatabase = () => {
  const rows: Array<Record<string, unknown>> = [];
  const layer = Layer.succeed(Database, {
    query: <A>(sql: string, bindings: ReadonlyArray<unknown>) => {
      const [key] = bindings;
      const pendingOnly = sql.includes("status = 'pending'");
      const matching = rows.filter(
        (row) =>
          (row["profileId"] === key || row["id"] === key) &&
          (!pendingOnly || row["status"] === "pending"),
      );
      return Effect.succeed(matching) as unknown as Effect.Effect<ReadonlyArray<A>>;
    },
    run: (sql: string, bindings: ReadonlyArray<unknown>) =>
      Effect.sync(() => {
        const columnsText = /^INSERT INTO proposals \(([^)]+)\)/.exec(sql)?.[1];
        if (columnsText === undefined) {
          throw new Error(`unexpected proposal test write: ${sql}`);
        }
        const columns = columnsText.split(", ");
        rows.push(Object.fromEntries(columns.map((column, index) => [column, bindings[index]])));
      }),
    runAffected: () => Effect.die("unused"),
    atomicAffected: () => Effect.die("unused"),
    atomic: () => Effect.die("unused"),
  });
  return layer;
};

describe("profile (authenticated)", () => {
  it("me exposes model-inference for Premium while Free does not", async () => {
    const getMe = async (premium: boolean) => {
      const { handler } = buildHandler({
        accounts: authedAs(alice),
        profiles: Layer.succeed(Profiles, {
          get: () => Effect.succeed({ ...blankProfile, headline: "Baker" }),
          set: () => Effect.die("unused"),
          getVersioned: () =>
            Effect.succeed({
              profile: { ...blankProfile, headline: "Baker" },
              profileUpdatedAt: "2026-08-25T08:00:00.000Z",
            }),
          setVersioned: () => Effect.die("unused"),
          answers: () => Effect.die("unused"),
          answer: () => Effect.die("unused"),
          unanswered: () => Effect.die("unused"),
        }),
        entitlements: Layer.succeed(Entitlements, {
          has: (_profile, capability) =>
            Effect.succeed(
              capability === "model-drafting" || (premium && capability === "model-inference"),
            ),
          require: () => Effect.die("unused"),
        }),
      });
      const response = await handler(
        new Request("http://localhost/api/v1/me", { headers: authHeaders }),
      );
      expect(response.status).toBe(200);
      return response.json();
    };

    const free = await getMe(false);
    const premium = await getMe(true);
    expect(free.profile.headline).toBe("Baker");
    expect(free.profileUpdatedAt).toBe("2026-08-25T08:00:00.000Z");
    expect(free.capabilities).toEqual(["model-drafting"]);
    expect(premium.profile.headline).toBe("Baker");
    expect(premium.capabilities).toEqual(["model-drafting", "model-inference"]);
  });

  it("setProfile writes the caller's profile and expected version through Profiles.setVersioned", async () => {
    let seen: unknown;
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      profiles: Layer.succeed(Profiles, {
        get: () => Effect.die("unused"),
        set: () => Effect.die("unused"),
        getVersioned: () => Effect.die("unused"),
        setVersioned: (profile, value, expectedUpdatedAt) => {
          seen = { profile, value, expectedUpdatedAt };
          return Effect.succeed({
            profile: value,
            profileUpdatedAt: "2026-08-25T08:00:00.001Z",
          });
        },
        answers: () => Effect.die("unused"),
        answer: () => Effect.die("unused"),
        unanswered: () => Effect.die("unused"),
      }),
    });
    const payload = { ...blankProfile, headline: "Warehouse operative" };
    const res = await handler(
      new Request("http://localhost/api/v1/me/profile", {
        method: "PUT",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          profile: payload,
          expectedUpdatedAt: "2026-08-25T08:00:00.000Z",
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(seen).toEqual({
      profile: alice,
      value: payload,
      expectedUpdatedAt: "2026-08-25T08:00:00.000Z",
    });
    await expect(res.json()).resolves.toEqual({
      profile: payload,
      profileUpdatedAt: "2026-08-25T08:00:00.001Z",
    });
  });

  it("maps a stale whole-profile write to a distinct typed 409 without retrying", async () => {
    let attempts = 0;
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      profiles: Layer.succeed(Profiles, {
        get: () => Effect.die("unused"),
        set: () => Effect.die("unused"),
        getVersioned: () => Effect.die("unused"),
        setVersioned: (_profile, _value, expectedUpdatedAt) => {
          attempts += 1;
          return Effect.fail(
            new StaleProfileWrite({
              expectedUpdatedAt,
              actualUpdatedAt: "2026-08-25T08:00:00.001Z",
            }),
          );
        },
        answers: () => Effect.die("unused"),
        answer: () => Effect.die("unused"),
        unanswered: () => Effect.die("unused"),
      }),
    });
    const res = await handler(
      new Request("http://localhost/api/v1/me/profile", {
        method: "PUT",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          profile: blankProfile,
          expectedUpdatedAt: "2026-08-25T08:00:00.000Z",
        }),
      }),
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      _tag: "StaleProfileUpdate",
      expectedUpdatedAt: "2026-08-25T08:00:00.000Z",
      actualUpdatedAt: "2026-08-25T08:00:00.001Z",
    });
    expect(attempts).toBe(1);
  });

  /**
   * `Profiles.answer` requires `asked.shape`; the wire payload has nowhere
   * to carry it (see `profile.ts`'s handler comment). This test pins the
   * default down as a fact, not an assumption.
   */
  it("setAnswer defaults the AnswerShape the wire payload cannot express to Text", async () => {
    let seenAsked: unknown;
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      profiles: Layer.succeed(Profiles, {
        get: () => Effect.die("unused"),
        set: () => Effect.die("unused"),
        getVersioned: () => Effect.die("unused"),
        setVersioned: () => Effect.die("unused"),
        answers: () => Effect.die("unused"),
        answer: (_profile, _question, _value, asked) => {
          seenAsked = asked;
          return Effect.void;
        },
        unanswered: () => Effect.die("unused"),
      }),
    });
    const res = await handler(
      new Request("http://localhost/api/v1/me/answers/notice-period", {
        method: "PUT",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({ value: "4 weeks" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ question: "notice-period" });
    expect(seenAsked).toEqual({ label: "notice-period", shape: { _tag: "Text" } });
  });

  it("exportProfile returns a JSON and Markdown rendering of the profile, plus the saved-job and application history", async () => {
    const profile: Profile = { ...blankProfile, headline: "Baker", skills: ["sourdough"] };
    const now = DateTime.nowUnsafe();
    const snapshot: JobSnapshot = {
      title: "Baker",
      employerName: "Bakery AS",
      location: "Oslo",
      description: "Bakes bread.",
      applicationUrl: "https://jobs.example.invalid/1",
      publishedAt: "2026-01-01T00:00:00Z",
    };
    const saved = new SavedJob({
      id: "sj_1" as never,
      profileId: alice,
      canonicalJobId: "cj_1" as never,
      jobSnapshot: snapshot,
      note: "",
      createdAt: now,
      updatedAt: now,
    });
    const application = new ApplicationRecord({
      id: "app_1" as never,
      profileId: alice,
      savedJobId: "sj_1" as never,
      canonicalJobId: "cj_1" as never,
      jobSnapshot: snapshot,
      method: "assisted",
      status: "ready",
      applicationUrl: snapshot.applicationUrl,
      cv: "CV",
      letter: "Letter",
      generator: "template",
      downgradeReason: Option.none(),
      notes: "",
      createdAt: now,
      updatedAt: now,
    });
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      profiles: Layer.succeed(Profiles, {
        get: () => Effect.succeed(profile),
        set: () => Effect.die("unused"),
        getVersioned: () => Effect.die("unused"),
        setVersioned: () => Effect.die("unused"),
        answers: () => Effect.die("unused"),
        answer: () => Effect.die("unused"),
        unanswered: () => Effect.die("unused"),
      }),
      savedJobs: Layer.succeed(SavedJobs, {
        save: () => Effect.die("unused"),
        resolve: () => Effect.die("unused"),
        list: () => Effect.succeed([saved]),
      }),
      applications: Layer.succeed(Applications, {
        prepare: () => Effect.die("unused"),
        recordEvent: () => Effect.die("unused"),
        setStatus: () => Effect.die("unused"),
        historyForSaved: () => Effect.die("unused"),
        history: () => Effect.succeed([application]),
      }),
    });
    const res = await handler(
      new Request("http://localhost/api/v1/me/profile/export", { headers: authHeaders }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(JSON.parse(body.json)).toEqual(profile);
    expect(body.markdown).toContain("# Baker");
    const history = JSON.parse(body.history.json);
    expect(history.savedJobs).toHaveLength(1);
    expect(history.applications).toHaveLength(1);
    expect(body.history.markdown).toContain("### Baker — Bakery AS");
    expect(body.history.markdown).toContain("## Applications");
    expect(body.markdown).toContain("sourdough");
  });

  it("keeps the profile export byte-identical while a repository-backed proposal remains pending", async () => {
    const profile: Profile = { ...blankProfile, headline: "Baker", skills: ["sourdough"] };
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      profiles: Layer.succeed(Profiles, {
        get: () => Effect.succeed(profile),
        set: () => Effect.die("unused"),
        getVersioned: () => Effect.die("unused"),
        setVersioned: () => Effect.die("unused"),
        answers: () => Effect.die("unused"),
        answer: () => Effect.die("unused"),
        unanswered: () => Effect.die("unused"),
      }),
      savedJobs: Layer.succeed(SavedJobs, {
        save: () => Effect.die("unused"),
        resolve: () => Effect.die("unused"),
        list: () => Effect.succeed([]),
      }),
      applications: Layer.succeed(Applications, {
        prepare: () => Effect.die("unused"),
        recordEvent: () => Effect.die("unused"),
        setStatus: () => Effect.die("unused"),
        historyForSaved: () => Effect.die("unused"),
        history: () => Effect.succeed([]),
      }),
      database: proposalDatabase(),
      extraction: Layer.succeed(Extraction, {
        extract: ({ content }) => Effect.succeed({ sourceKind: "text", text: content }),
      }),
      heuristicInference: Layer.succeed(HeuristicInference, {
        propose: () =>
          Effect.succeed([
            {
              fieldPath: "headline",
              proposedValue: "Pastry chef",
              evidenceExcerpt: "Pastry chef at Bakery AS",
              confidence: "high",
            },
          ]),
      }),
    });
    const exportProfile = () =>
      handler(new Request("http://localhost/api/v1/me/profile/export", { headers: authHeaders }));

    const before = await exportProfile();
    expect(before.status).toBe(200);
    const beforeBytes = await before.text();

    const created = await handler(
      new Request("http://localhost/api/v1/me/profile/proposals", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({ content: "Pastry chef at Bakery AS", mimeType: "text/plain" }),
      }),
    );
    expect(created.status).toBe(200);

    const after = await exportProfile();
    expect(after.status).toBe(200);
    const afterBytes = await after.text();

    const listed = await handler(
      new Request("http://localhost/api/v1/me/profile/proposals", { headers: authHeaders }),
    );
    expect(listed.status).toBe(200);
    const pending = await listed.json();
    expect(pending.data).toHaveLength(1);
    expect(pending.data[0]).toMatchObject({ fieldPath: "headline", status: "pending" });
    expect(afterBytes).toBe(beforeBytes);
  });

  it("importProfile decodes JSON and carries the caller's expected profile version", async () => {
    let seen: unknown;
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      profiles: Layer.succeed(Profiles, {
        get: () => Effect.die("unused"),
        set: () => Effect.die("unused"),
        getVersioned: () => Effect.die("unused"),
        setVersioned: (profile, value, expectedUpdatedAt) => {
          seen = { profile, value, expectedUpdatedAt };
          return Effect.succeed({
            profile: value,
            profileUpdatedAt: "2026-08-25T08:00:00.001Z",
          });
        },
        answers: () => Effect.die("unused"),
        answer: () => Effect.die("unused"),
        unanswered: () => Effect.die("unused"),
      }),
    });
    const imported = { ...blankProfile, headline: "Warehouse operative" };
    const res = await handler(
      new Request("http://localhost/api/v1/me/profile/import", {
        method: "PUT",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          json: JSON.stringify(imported),
          expectedUpdatedAt: "2026-08-25T08:00:00.000Z",
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      profile: imported,
      profileUpdatedAt: "2026-08-25T08:00:00.001Z",
    });
    expect(seen).toEqual({
      profile: alice,
      value: imported,
      expectedUpdatedAt: "2026-08-25T08:00:00.000Z",
    });
  });

  /** A typo'd field must fail loudly, naming it, rather than silently importing a partial profile. */
  it("importProfile rejects JSON with an unrecognised field, naming it, and never calls Profiles.setVersioned", async () => {
    let setVersionedCalled = false;
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      profiles: Layer.succeed(Profiles, {
        get: () => Effect.die("unused"),
        set: () => Effect.die("unused"),
        getVersioned: () => Effect.die("unused"),
        setVersioned: () => {
          setVersionedCalled = true;
          return Effect.die("should not be called");
        },
        answers: () => Effect.die("unused"),
        answer: () => Effect.die("unused"),
        unanswered: () => Effect.die("unused"),
      }),
    });
    const malformed = { ...blankProfile, hobby: "chess" };
    const res = await handler(
      new Request("http://localhost/api/v1/me/profile/import", {
        method: "PUT",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          json: JSON.stringify(malformed),
          expectedUpdatedAt: null,
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/hobby/);
    expect(setVersionedCalled).toBe(false);
  });
});
