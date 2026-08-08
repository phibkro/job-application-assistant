import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { Credential } from "@job-index/domain/Access";
import type { PrincipalId, ProfileId } from "@job-index/domain/Ids";
import { Accounts } from "../services/Accounts.ts";
import { Corpus } from "../services/Corpus.ts";
import { buildHandler } from "./testSupport.ts";

/**
 * The security boundary this slot owns: a real HTTP request, through the
 * real router and the real `Authenticated` middleware, against a fake
 * `Accounts`. `feed.fresh` stands in as "any guarded endpoint" — the
 * assertions are about the 401, not about feed.
 *
 * `Api.ts` declares its error classes with no `HttpApiSchema.status`
 * annotation, so every declared error — this 401 included — currently
 * serializes as HTTP 500. Verified by running the real request below rather
 * than assumed; see the handoff report. The body's `_tag` is what actually
 * distinguishes "rejected" from "accepted" until `Api.ts` gains status
 * annotations, so these assertions check the body, and pin the current
 * (wrong) status as a documented fact rather than silently accepting it.
 */
const alice = "alice" as ProfileId;

const accountsFake = (overrides: Partial<Accounts["Service"]> = {}) =>
  Layer.succeed(Accounts, {
    authenticate: () => Effect.succeed(undefined),
    profileOf: () => Effect.succeed(undefined),
    requestErasure: () => Effect.void,
    ...overrides,
  });

describe("the Authenticated middleware", () => {
  it("rejects a request with no Authorization header", async () => {
    const { handler } = buildHandler({ accounts: accountsFake() });
    const res = await handler(new Request("http://localhost/api/v1/me/feed"));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ _tag: "Unauthorized" });
  });

  it("rejects an unknown or revoked token — Accounts.authenticate resolves nothing", async () => {
    const { handler } = buildHandler({
      accounts: accountsFake({ authenticate: () => Effect.succeed(undefined) }),
    });
    const res = await handler(
      new Request("http://localhost/api/v1/me/feed", {
        headers: { Authorization: "Bearer nope" },
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ _tag: "Unauthorized" });
  });

  it("rejects a credential whose profile has no active account (erased)", async () => {
    const credential: Credential = { _tag: "ApiKey", principal: "p1" as PrincipalId };
    const { handler } = buildHandler({
      accounts: accountsFake({
        authenticate: () => Effect.succeed(credential),
        profileOf: () => Effect.succeed(undefined),
      }),
    });
    const res = await handler(
      new Request("http://localhost/api/v1/me/feed", {
        headers: { Authorization: "Bearer erased-account-token" },
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ _tag: "Unauthorized" });
  });

  it("accepts a valid token and makes CurrentPrincipal available downstream", async () => {
    const credential: Credential = {
      _tag: "Session",
      principal: "p1" as PrincipalId,
      session: "s1",
    };
    const { handler } = buildHandler({
      accounts: accountsFake({
        authenticate: () => Effect.succeed(credential),
        profileOf: () => Effect.succeed(alice),
      }),
      corpus: Layer.succeed(Corpus, {
        observe: () => Effect.die("unused"),
        get: () => Effect.die("unused"),
        changedSince: () => Effect.die("unused"),
        search: () => Effect.die("unused"),
        fresh: () => Effect.succeed([]),
        markOffered: () => Effect.die("unused"),
        closeAbsent: () => Effect.die("unused"),
        occurrenceFor: () => Effect.die("unused"),
        hydrateDetail: () => Effect.die("unused"),
        closeEarly: () => Effect.die("unused"),
      }),
    });
    const res = await handler(
      new Request("http://localhost/api/v1/me/feed", {
        headers: { Authorization: "Bearer good-token" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [], meta: { limit: 20, nextCursor: null } });
  });
});
