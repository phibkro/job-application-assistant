import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { PrincipalId, ProfileId } from "@job-index/domain/Ids";
import type { Profile } from "@job-index/domain/Profile";
import { layerSqlite } from "../db/Sqlite.ts";
import { Database } from "../services/Database.ts";
import { Accounts, Profiles } from "../services/Accounts.ts";
import { layer as accountsLayer } from "./index.ts";
import { sha256Hex } from "./hash.ts";
import { PRINCIPAL_FIELDS } from "./sql.ts";

/**
 * Accounts against a real SQL engine running the generated schema.
 *
 * `fixtures.ts`'s fake `Database` recognises a statement by its `--
 * accounts:<op>` tag, not by parsing it, so it cannot tell a `profiles`
 * insert naming a `headline` column from one naming `cv` — that mismatch is
 * exactly what let this slot drift from `db/schema.sql` unnoticed (see the
 * task's contract-gap history in `accounts.ts`/`profileRow.ts` before this
 * change). `bun:sqlite` executing the real generated schema rejects a wrong
 * column, a missing table, or a placeholder count that does not match its
 * bindings, which is why this file exists.
 *
 * `principals` provisioning is out of this slot's scope (no domain method
 * creates one), so a principal row is seeded here with a raw `INSERT` built
 * from the same `PRINCIPAL_FIELDS` list `sql.ts` uses — the column order
 * cannot drift from what `accounts.ts` itself reads.
 */
const run = <A>(effect: Effect.Effect<A, never, Accounts | Profiles | Database>): Promise<A> =>
  Effect.runPromise(Effect.provide(effect, Layer.provideMerge(accountsLayer, layerSqlite())));

const profileId = Schema.decodeUnknownSync(ProfileId)("profile-1");
const principalId = Schema.decodeUnknownSync(PrincipalId)("principal-1");

const sample: Profile = {
  headline: "Support engineer",
  summary: "Five years in customer support.",
  location: "Oslo",
  languages: "Norwegian, English",
  skills: ["Zendesk"],
  experience: [],
  education: [],
};

const insertPrincipal = `INSERT INTO principals (${PRINCIPAL_FIELDS.join(", ")}) VALUES (${PRINCIPAL_FIELDS.map(() => "?").join(", ")})`;

const seedPrincipal = (db: Database["Service"], apiKeyHash: string) =>
  db.run(insertPrincipal, [
    principalId,
    profileId,
    apiKeyHash,
    null,
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z",
  ]);

describe("accounts on a real SQLite engine", () => {
  it("writing and reading back a profile round-trips the CV through the generated schema", async () => {
    const profile = await run(
      Effect.gen(function* () {
        const profiles = yield* Profiles;
        yield* profiles.set(profileId, sample);
        return yield* profiles.get(profileId);
      }),
    );
    expect(profile).toEqual(sample);
  });

  it("a second write updates the existing row rather than violating the primary key", async () => {
    const updated: Profile = { ...sample, headline: "Senior support engineer" };
    const profile = await run(
      Effect.gen(function* () {
        const profiles = yield* Profiles;
        yield* profiles.set(profileId, sample);
        yield* profiles.set(profileId, updated);
        return yield* profiles.get(profileId);
      }),
    );
    expect(profile).toEqual(updated);
  });

  it("authenticates a principal by its api key hash", async () => {
    const credential = await run(
      Effect.gen(function* () {
        const db = yield* Database;
        const hash = yield* sha256Hex("a-real-api-key");
        yield* seedPrincipal(db, hash);
        const accounts = yield* Accounts;
        return yield* accounts.authenticate("a-real-api-key");
      }),
    );
    expect(credential).toEqual({ _tag: "ApiKey", principal: principalId });
  });

  it("requesting erasure blocks the next access for that same principal", async () => {
    const credential = { _tag: "ApiKey" as const, principal: principalId };
    const outcome = await run(
      Effect.gen(function* () {
        const db = yield* Database;
        const hash = yield* sha256Hex("another-api-key");
        yield* seedPrincipal(db, hash);
        const accounts = yield* Accounts;
        const before = yield* accounts.profileOf(credential);
        yield* accounts.requestErasure(profileId);
        const after = yield* accounts.profileOf(credential);
        return { before, after };
      }),
    );
    expect(outcome.before).toBe(profileId);
    expect(outcome.after).toBeUndefined();
  });
});
