import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { Credential } from "@job-index/domain/Access";
import type { CanonicalJob } from "@job-index/domain/Job";
import type { CanonicalJobId, PrincipalId, ProfileId, Sequence } from "@job-index/domain/Ids";
import type { Profile } from "@job-index/domain/Profile";
import { Accounts, Profiles } from "../services/Accounts.ts";
import { Corpus } from "../services/Corpus.ts";
import { Judgements } from "../services/Judgements.ts";
import { buildHandler } from "./testSupport.ts";

const alice = "alice" as ProfileId;

const authedAs = (profile: ProfileId) => {
  const credential: Credential = { _tag: "Session", principal: "p1" as PrincipalId, session: "s1" };
  return Layer.succeed(Accounts, {
    authenticate: () => Effect.succeed(credential),
    profileOf: () => Effect.succeed(profile),
    requestErasure: () => Effect.die("unused"),
  });
};

const authHeaders = { Authorization: "Bearer good-token" };
const profile: Profile = {
  headline: "Baker",
  summary: "",
  location: "Oslo",
  languages: "",
  skills: [],
  experience: [],
  education: [],
};

describe("feed (authenticated)", () => {
  it("fresh reads Corpus.fresh scoped to CurrentPrincipal.profileId", async () => {
    const job: CanonicalJob = {
      id: "cj_1" as CanonicalJobId,
      title: "Baker",
      employerName: "Bakery AS",
      location: "Oslo",
      applicationUrl: "https://example.com/1",
      publishedAt: "2026-01-01T00:00:00Z",
      status: { _tag: "Active" },
      sequence: 5 as Sequence,
      changedAt: "2026-01-01T00:00:00Z",
      sources: [],
      hydration: { _tag: "Unhydrated" },
    };
    let seenProfile: unknown;
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      corpus: Layer.succeed(Corpus, {
        observe: () => Effect.die("unused"),
        get: () => Effect.die("unused"),
        changedSince: () => Effect.die("unused"),
        search: () => Effect.die("unused"),
        fresh: (profileId, limit) => {
          seenProfile = profileId;
          return Effect.succeed([job].slice(0, limit));
        },
        markOffered: () => Effect.die("unused"),
        closeAbsent: () => Effect.die("unused"),
        occurrenceFor: () => Effect.die("unused"),
        hydrateDetail: () => Effect.die("unused"),
        closeEarly: () => Effect.die("unused"),
      }),
      profiles: Layer.succeed(Profiles, {
        get: () => Effect.succeed(profile),
        set: () => Effect.die("unused"),
        answers: () => Effect.die("unused"),
        answer: () => Effect.die("unused"),
        unanswered: () => Effect.die("unused"),
      }),
    });
    const res = await handler(
      new Request("http://localhost/api/v1/me/feed", { headers: authHeaders }),
    );
    expect(res.status).toBe(200);
    expect(seenProfile).toBe(alice);
    expect((await res.json()).data).toHaveLength(1);
  });

  it("dismiss records a Judgement against CurrentPrincipal.profileId with the decoded verdict", async () => {
    const calls: Array<unknown> = [];
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      judgements: Layer.succeed(Judgements, {
        record: (profileId, job, verdict, reason) => {
          calls.push({ profile: profileId, job, verdict, reason });
          return Effect.void;
        },
      }),
    });
    const res = await handler(
      new Request("http://localhost/api/v1/me/feed/cj_1/dismiss", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({ verdict: "not_now", reason: "already applied elsewhere" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ dismissed: "cj_1" });
    expect(calls).toEqual([
      { profile: alice, job: "cj_1", verdict: "not_now", reason: "already applied elsewhere" },
    ]);
  });

  it("dismiss fails loud on a verdict outside the domain's three-way literal", async () => {
    const { handler } = buildHandler({
      accounts: authedAs(alice),
      judgements: Layer.succeed(Judgements, { record: () => Effect.die("should not be reached") }),
    });
    const res = await handler(
      new Request("http://localhost/api/v1/me/feed/cj_1/dismiss", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({ verdict: "not-a-real-verdict" }),
      }),
    );
    expect(res.status).not.toBe(200);
  });
});
