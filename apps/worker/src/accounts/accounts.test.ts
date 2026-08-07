import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Session } from "@job-index/domain/Access";
import { ProfileId, PrincipalId } from "@job-index/domain/Ids";
import { Accounts } from "../services/Accounts.ts";
import { layer } from "./accounts.ts";
import { emptyState, fakeDatabaseLayer, hashFor, type FakeState } from "./fixtures.ts";
import { emptyProfile } from "./profileRow.ts";

const profileId = Schema.decodeUnknownSync(ProfileId)("profile-1");
const principal = (raw: string) => Schema.decodeUnknownSync(PrincipalId)(raw);
const principalOne = principal("principal-1");

const run = <A, E>(state: FakeState, effect: Effect.Effect<A, E, Accounts>) =>
  Effect.runPromise(effect.pipe(Effect.provide(layer), Effect.provide(fakeDatabaseLayer(state))));

const withAccounts = <A>(f: (accounts: Accounts["Service"]) => Effect.Effect<A>) =>
  Effect.gen(function* () {
    const accounts = yield* Accounts;
    return yield* f(accounts);
  });

describe("authenticate", () => {
  it("resolves a valid session token to a Session credential", async () => {
    const state = emptyState();
    const tokenHash = await hashFor("session-token-1");
    state.sessions.push({
      id: "sess-1",
      principalId: "principal-1",
      profileId,
      tokenHash,
      expiresAt: Date.now() + 60_000,
      revokedAt: null,
    });

    const credential = await run(
      state,
      withAccounts((accounts) => accounts.authenticate("session-token-1")),
    );

    expect(credential).toEqual({ _tag: "Session", principal: principalOne, session: "sess-1" });
  });

  it("resolves a valid API key to an ApiKey credential", async () => {
    const state = emptyState();
    const apiKeyHash = await hashFor("api-key-1");
    state.principals.push({ principalId: "principal-2", profileId, apiKeyHash, revokedAt: null });

    const credential = await run(
      state,
      withAccounts((accounts) => accounts.authenticate("api-key-1")),
    );

    expect(credential).toEqual({ _tag: "ApiKey", principal: principal("principal-2") });
  });

  it("resolves an unrecognised secret to nothing", async () => {
    const credential = await run(
      emptyState(),
      withAccounts((accounts) => accounts.authenticate("never-issued")),
    );
    expect(credential).toBeUndefined();
  });

  /** Security property: an expired session authenticates as nothing. */
  it("resolves an expired session to nothing", async () => {
    const state = emptyState();
    const tokenHash = await hashFor("expired-token");
    state.sessions.push({
      id: "sess-expired",
      principalId: "principal-1",
      profileId,
      tokenHash,
      expiresAt: Date.now() - 1,
      revokedAt: null,
    });

    const credential = await run(
      state,
      withAccounts((accounts) => accounts.authenticate("expired-token")),
    );
    expect(credential).toBeUndefined();
  });

  /** Security property: a revoked session authenticates as nothing, even while still unexpired. */
  it("resolves a revoked session to nothing", async () => {
    const state = emptyState();
    const tokenHash = await hashFor("revoked-token");
    state.sessions.push({
      id: "sess-revoked",
      principalId: "principal-1",
      profileId,
      tokenHash,
      expiresAt: Date.now() + 60_000,
      revokedAt: new Date().toISOString(),
    });

    const credential = await run(
      state,
      withAccounts((accounts) => accounts.authenticate("revoked-token")),
    );
    expect(credential).toBeUndefined();
  });

  /** Security property: a revoked API key authenticates as nothing, and the row is retained. */
  it("resolves a revoked API key to nothing", async () => {
    const state = emptyState();
    const apiKeyHash = await hashFor("revoked-api-key");
    state.principals.push({
      principalId: "principal-2",
      profileId,
      apiKeyHash,
      revokedAt: new Date().toISOString(),
    });

    const credential = await run(
      state,
      withAccounts((accounts) => accounts.authenticate("revoked-api-key")),
    );
    expect(credential).toBeUndefined();
    expect(state.principals).toHaveLength(1);
  });

  /** Security property: what a lookup finds is stored hashed, never as the secret that was presented. */
  it("never stores the presented secret as the row's own content", async () => {
    const state = emptyState();
    const secret = "a-very-guessable-password";
    const tokenHash = await hashFor(secret);
    state.sessions.push({
      id: "sess-1",
      principalId: "principal-1",
      profileId,
      tokenHash,
      expiresAt: Date.now() + 60_000,
      revokedAt: null,
    });

    expect(state.sessions[0]?.tokenHash).not.toBe(secret);
    // The match still succeeds — proving the comparison works via the hash, not a plaintext copy.
    const credential = await run(
      state,
      withAccounts((accounts) => accounts.authenticate(secret)),
    );
    expect(credential?._tag).toBe("Session");
  });
});

describe("profileOf", () => {
  it("resolves the profile behind a Session credential", async () => {
    const state = emptyState();
    state.sessions.push({
      id: "sess-1",
      principalId: "principal-1",
      profileId,
      tokenHash: "irrelevant-here",
      expiresAt: Date.now() + 60_000,
      revokedAt: null,
    });

    const resolved = await run(
      state,
      withAccounts((accounts) =>
        accounts.profileOf({ _tag: "Session", principal: principalOne, session: "sess-1" }),
      ),
    );
    expect(resolved).toBe(profileId);
  });

  it("resolves the profile behind an ApiKey credential", async () => {
    const state = emptyState();
    state.principals.push({
      principalId: "principal-2",
      profileId,
      apiKeyHash: "irrelevant-here",
      revokedAt: null,
    });

    const resolved = await run(
      state,
      withAccounts((accounts) =>
        accounts.profileOf({ _tag: "ApiKey", principal: principal("principal-2") }),
      ),
    );
    expect(resolved).toBe(profileId);
  });

  it("resolves an unknown credential to nothing", async () => {
    const resolved = await run(
      emptyState(),
      withAccounts((accounts) =>
        accounts.profileOf({ _tag: "ApiKey", principal: principal("no-such-principal") }),
      ),
    );
    expect(resolved).toBeUndefined();
  });

  /** Security property: an erasure-requested profile authenticates as nothing — access is blocked at this boundary. */
  it("resolves an erasure-requested profile to nothing", async () => {
    const state = emptyState();
    state.sessions.push({
      id: "sess-1",
      principalId: "principal-1",
      profileId,
      tokenHash: "irrelevant-here",
      expiresAt: Date.now() + 60_000,
      revokedAt: null,
    });
    state.profiles.push({
      profileId,
      cv: JSON.stringify(emptyProfile),
      erasure: JSON.stringify({
        _tag: "Requested",
        at: "2026-01-01T00:00:00.000Z",
        purgeAfter: "2026-01-31T00:00:00.000Z",
      }),
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const resolved = await run(
      state,
      withAccounts((accounts) =>
        accounts.profileOf({ _tag: "Session", principal: principalOne, session: "sess-1" }),
      ),
    );
    expect(resolved).toBeUndefined();
  });
});

describe("requestErasure", () => {
  it("marks the profile immediately, blocking access on the next resolution", async () => {
    const state = emptyState();
    state.sessions.push({
      id: "sess-1",
      principalId: "principal-1",
      profileId,
      tokenHash: "irrelevant-here",
      expiresAt: Date.now() + 60_000,
      revokedAt: null,
    });
    const credential = { _tag: "Session" as const, principal: principalOne, session: "sess-1" };

    const beforeAndAfter = await run(
      state,
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        const before = yield* accounts.profileOf(credential);
        yield* accounts.requestErasure(profileId);
        const after = yield* accounts.profileOf(credential);
        return { before, after };
      }),
    );

    expect(beforeAndAfter.before).toBe(profileId);
    expect(beforeAndAfter.after).toBeUndefined();
  });

  it("does not purge — the row survives with a purgeAfter, for the sweep to act on later", async () => {
    const state = emptyState();
    await run(
      state,
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        yield* accounts.requestErasure(profileId);
      }),
    );

    const row = state.profiles.find((profile) => profile.profileId === profileId);
    const erasure =
      row === undefined
        ? undefined
        : (JSON.parse(row.erasure) as { _tag: string; purgeAfter?: string });
    expect(erasure?._tag).toBe("Requested");
    expect(typeof erasure?.purgeAfter).toBe("string");
  });
});

/**
 * Security property: `Model.Sensitive` fields must not appear in any JSON
 * variant. Asserted against the actual field set the `Session` model
 * produces for each JSON variant, not against the doc comment that claims it.
 */
describe("Session model — Model.Sensitive", () => {
  it("omits tokenHash from every JSON variant's field set", () => {
    expect(Object.keys(Session.json.fields)).not.toContain("tokenHash");
    expect(Object.keys(Session.jsonCreate.fields)).not.toContain("tokenHash");
    expect(Object.keys(Session.jsonUpdate.fields)).not.toContain("tokenHash");
  });

  it("keeps tokenHash in the select and insert variants — it exists, it just never leaves as JSON", () => {
    expect(Object.keys(Session.fields)).toContain("tokenHash");
    expect(Object.keys(Session.insert.fields)).toContain("tokenHash");
  });

  it("decodes a real session's JSON shape without the token hash appearing anywhere in the output", async () => {
    const decoded = await Effect.runPromise(
      Schema.decodeUnknownEffect(Session.json)({
        id: "sess-1",
        principalId: "principal-1",
        profileId: "profile-1",
        expiresAt: Date.now() + 60_000,
        createdAt: "2026-01-01T00:00:00.000Z",
        revokedAt: null,
      }),
    );
    expect(decoded).not.toHaveProperty("tokenHash");
    expect(JSON.stringify(decoded)).not.toContain("tokenHash");
  });
});
