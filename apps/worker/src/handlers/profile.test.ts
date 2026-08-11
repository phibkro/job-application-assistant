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
import { Accounts, Profiles } from "../services/Accounts.ts";
import { Applications } from "../services/Applications.ts";
import { Entitlements } from "../services/Entitlements.ts";
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

describe("profile (authenticated)", () => {
  it("me combines Profiles.get with the capabilities Entitlements currently grants", async () => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      profiles: Layer.succeed(Profiles, {
        get: () => Effect.succeed({ ...blankProfile, headline: "Baker" }),
        set: () => Effect.die("unused"),
        answers: () => Effect.die("unused"),
        answer: () => Effect.die("unused"),
        unanswered: () => Effect.die("unused"),
      }),
      entitlements: Layer.succeed(Entitlements, {
        has: (_profile, capability) => Effect.succeed(capability === "model-drafting"),
        require: () => Effect.die("unused"),
      }),
    });
    const res = await handler(new Request("http://localhost/api/v1/me", { headers: authHeaders }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.headline).toBe("Baker");
    expect(body.capabilities).toEqual(["model-drafting"]);
  });

  it("setProfile writes through Profiles.set against CurrentPrincipal.profileId", async () => {
    let seen: unknown;
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      profiles: Layer.succeed(Profiles, {
        get: () => Effect.die("unused"),
        set: (profile, value) => {
          seen = { profile, value };
          return Effect.succeed(value);
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
        body: JSON.stringify(payload),
      }),
    );
    expect(res.status).toBe(200);
    expect(seen).toEqual({ profile: alice, value: payload });
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

  it("importProfile decodes the JSON text and writes it through Profiles.set", async () => {
    let seen: unknown;
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      profiles: Layer.succeed(Profiles, {
        get: () => Effect.die("unused"),
        set: (profile, value) => {
          seen = { profile, value };
          return Effect.succeed(value);
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
        body: JSON.stringify({ json: JSON.stringify(imported) }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(imported);
    expect(seen).toEqual({ profile: alice, value: imported });
  });

  /** A typo'd field must fail loudly, naming it, rather than silently importing a partial profile. */
  it("importProfile rejects JSON with an unrecognised field, naming it, and never calls Profiles.set", async () => {
    let setCalled = false;
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      profiles: Layer.succeed(Profiles, {
        get: () => Effect.die("unused"),
        set: () => {
          setCalled = true;
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
        body: JSON.stringify({ json: JSON.stringify(malformed) }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/hobby/);
    expect(setCalled).toBe(false);
  });
});
