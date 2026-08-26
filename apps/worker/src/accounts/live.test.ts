import { describe, expect, it } from "vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { PrincipalId, ProfileId, ProposalId } from "@job-index/domain/Ids";
import { Proposal } from "@job-index/domain/Proposals";
import type { Profile } from "@job-index/domain/Profile";
import { layerSqlite } from "../db/Sqlite.ts";
import { Database } from "../services/Database.ts";
import { Accounts, Profiles } from "../services/Accounts.ts";
import { layer as accountsLayer } from "./index.ts";
import { sha256Hex } from "./hash.ts";
import { PRINCIPAL_FIELDS } from "./sql.ts";
import {
  emptyProfile,
  profileWriteForPendingProposal,
  readProfileRow,
  tombstoneWrite,
  toDomainProfile,
} from "./profileRow.ts";
import { acceptProposal, aiConsentWrite } from "./profiles.ts";
import * as Proposals from "../db/repositories/Proposals.ts";

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
const proposalId = Schema.decodeUnknownSync(ProposalId);
const otherProfileId = Schema.decodeUnknownSync(ProfileId)("profile-2");

const sample: Profile = {
  headline: "Support engineer",
  summary: "Five years in customer support.",
  location: "Oslo",
  languages: "Norwegian, English",
  skills: ["Zendesk"],
  experience: [],
  education: [],
};

const proposal = (
  id: string,
  fieldPath: string,
  proposedValue: unknown,
  owner = profileId,
): Proposal =>
  new Proposal({
    id: proposalId(id),
    profileId: owner,
    sourceKind: "text",
    fieldPath,
    proposedValue,
    evidenceExcerpt: String(proposedValue),
    confidence: "high",
    engine: "heuristic",
    status: "pending",
    createdAt: DateTime.makeUnsafe("2026-08-25T01:00:00.000Z"),
    decidedAt: Option.none(),
  });

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
  it("writing and reading back a versioned profile round-trips the CV through the generated schema", async () => {
    const current = await run(
      Effect.gen(function* () {
        const profiles = yield* Profiles;
        const written = yield* profiles.setVersioned(profileId, sample, null).pipe(Effect.orDie);
        return {
          written,
          read: yield* profiles.getVersioned(profileId),
        };
      }),
    );
    expect(current.read).toEqual(current.written);
    expect(current.read.profile).toEqual(sample);
    expect(current.read.profileUpdatedAt).not.toBeNull();
  });

  it("a second versioned write updates the existing row rather than violating the primary key", async () => {
    const updated: Profile = { ...sample, headline: "Senior support engineer" };
    const current = await run(
      Effect.gen(function* () {
        const profiles = yield* Profiles;
        const first = yield* profiles.setVersioned(profileId, sample, null).pipe(Effect.orDie);
        const second = yield* profiles
          .setVersioned(profileId, updated, first.profileUpdatedAt)
          .pipe(Effect.orDie);
        return {
          second,
          read: yield* profiles.getVersioned(profileId),
        };
      }),
    );
    expect(current.read).toEqual(current.second);
    expect(current.read.profile).toEqual(updated);
  });

  it("consent changes only aiAssist without changing CV, erasure, or profile updatedAt", async () => {
    const result = await run(
      Effect.gen(function* () {
        const db = yield* Database;
        const profiles = yield* Profiles;
        yield* profiles.setVersioned(profileId, sample, null).pipe(Effect.orDie);
        const before = yield* readProfileRow(db, profileId);
        yield* profiles.setAiConsent(profileId, true);
        return { before, after: yield* readProfileRow(db, profileId) };
      }),
    );
    expect(result.after).toEqual({ ...result.before, aiAssist: 1 });
  });

  it("a prepared consent write executed after deletion affects zero rows and cannot resurrect the tombstone", async () => {
    const result = await run(
      Effect.gen(function* () {
        const db = yield* Database;
        const profiles = yield* Profiles;
        yield* profiles.setVersioned(profileId, sample, null).pipe(Effect.orDie);
        const prepared = aiConsentWrite(profileId, true);
        yield* db.atomic([tombstoneWrite(profileId, "2026-08-26T12:00:00.000Z")]);
        const affected = yield* db.runAffected(prepared.sql, prepared.bindings);
        return { affected, row: yield* readProfileRow(db, profileId) };
      }),
    );
    expect(result.affected).toBe(0);
    expect(result.row).toMatchObject({
      cv: JSON.stringify(emptyProfile),
      aiAssist: 0,
      updatedAt: "2026-08-26T12:00:00.000Z",
    });
    expect(JSON.parse(result.row!.erasure)).toEqual({
      _tag: "Purged",
      at: "2026-08-26T12:00:00.000Z",
    });
  });
  it("whole-profile CAS cannot write through a matching deletion-state revision", async () => {
    const result = await run(
      Effect.gen(function* () {
        const db = yield* Database;
        const accounts = yield* Accounts;
        const profiles = yield* Profiles;
        yield* profiles.setVersioned(profileId, sample, null).pipe(Effect.orDie);
        yield* accounts.requestErasure(profileId);
        const requested = yield* readProfileRow(db, profileId);
        const attempted = yield* Effect.exit(
          profiles.setVersioned(
            profileId,
            { ...sample, headline: "Must not land" },
            requested?.updatedAt ?? null,
          ),
        );
        return { attempted, row: yield* readProfileRow(db, profileId) };
      }),
    );
    expect(result.attempted._tag).toBe("Failure");
    expect(toDomainProfile(result.row!)).toEqual(sample);
    expect(JSON.parse(result.row!.erasure)).toMatchObject({ _tag: "Requested" });
  });

  it("consent and CV update interleavings preserve both independently owned values", async () => {
    const result = await run(
      Effect.gen(function* () {
        const db = yield* Database;
        const profiles = yield* Profiles;
        const initial = yield* profiles.setVersioned(profileId, sample, null).pipe(Effect.orDie);

        yield* profiles.setAiConsent(profileId, true);
        const cvAfterConsent = { ...sample, headline: "CV after consent" };
        const first = yield* profiles
          .setVersioned(profileId, cvAfterConsent, initial.profileUpdatedAt)
          .pipe(Effect.orDie);
        const afterConsentThenCv = yield* readProfileRow(db, profileId);

        const cvPreparedBeforeConsent = { ...sample, headline: "CV prepared before consent" };
        yield* profiles.setAiConsent(profileId, false);
        yield* profiles
          .setVersioned(profileId, cvPreparedBeforeConsent, first.profileUpdatedAt)
          .pipe(Effect.orDie);
        return {
          afterConsentThenCv,
          afterCvInterleaving: yield* readProfileRow(db, profileId),
        };
      }),
    );
    expect(toDomainProfile(result.afterConsentThenCv!)).toMatchObject({
      headline: "CV after consent",
    });
    expect(result.afterConsentThenCv?.aiAssist).toBe(1);
    expect(toDomainProfile(result.afterCvInterleaving!)).toMatchObject({
      headline: "CV prepared before consent",
    });
    expect(result.afterCvInterleaving?.aiAssist).toBe(0);
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

  it("retries two distinct stale proposal snapshots and preserves both merges", async () => {
    const result = await run(
      Effect.gen(function* () {
        const db = yield* Database;
        const profiles = yield* Profiles;
        yield* profiles.setVersioned(profileId, sample, null).pipe(Effect.orDie);
        const firstId = proposalId("sqlite-distinct-a");
        const secondId = proposalId("sqlite-distinct-b");
        yield* Proposals.insert(proposal(firstId, "skills.0", "TypeScript"));
        yield* Proposals.insert(proposal(secondId, "skills.1", "SQLite"));
        const observed = yield* readProfileRow(db, profileId);
        if (observed === undefined) return yield* Effect.die("missing seeded profile");
        const current = toDomainProfile(observed);
        const first = profileWriteForPendingProposal(
          profileId,
          { ...current, skills: [...current.skills, "TypeScript"] },
          firstId,
          observed,
          "2026-08-25T02:00:00.000Z",
        );
        const staleSecond = profileWriteForPendingProposal(
          profileId,
          { ...current, skills: [...current.skills, "SQLite"] },
          secondId,
          observed,
          "2026-08-25T02:00:00.000Z",
        );
        const firstVector = yield* db.atomicAffected([
          first.write,
          Proposals.markAcceptedAfterProfileWrite(firstId, profileId, "2026-08-25T02:00:00.000Z"),
        ]);
        const staleVector = yield* db.atomicAffected([
          staleSecond.write,
          Proposals.markAcceptedAfterProfileWrite(secondId, profileId, "2026-08-25T02:00:00.000Z"),
        ]);
        const retried = yield* acceptProposal(
          db,
          profileId,
          secondId,
          "2026-08-25T02:00:00.001Z",
          (latest) => ({ ...latest, skills: [...latest.skills, "SQLite"] }),
        );
        return {
          firstVector,
          staleVector,
          retried,
          current: yield* profiles.getVersioned(profileId),
        };
      }),
    );

    expect(result.firstVector).toEqual([1, 1]);
    expect(result.staleVector).toEqual([0, 0]);
    expect(result.retried?.profile.skills).toEqual(["Zendesk", "TypeScript", "SQLite"]);
    expect(result.current).toEqual(result.retried);
  });

  it("preserves an ordinary save on accept retry and rejects the earlier stale replacement", async () => {
    const result = await run(
      Effect.gen(function* () {
        const db = yield* Database;
        const profiles = yield* Profiles;
        const initial = yield* profiles.setVersioned(profileId, sample, null).pipe(Effect.orDie);
        const id = proposalId("sqlite-save-before-accept");
        yield* Proposals.insert(proposal(id, "skills.0", "TypeScript"));
        const observed = yield* readProfileRow(db, profileId);
        if (observed === undefined) return yield* Effect.die("missing seeded profile");
        const staleAccept = profileWriteForPendingProposal(
          profileId,
          { ...toDomainProfile(observed), skills: [...sample.skills, "TypeScript"] },
          id,
          observed,
          "2026-08-25T02:00:00.000Z",
        );
        yield* profiles
          .setVersioned(
            profileId,
            { ...sample, summary: "Saved in another tab" },
            initial.profileUpdatedAt,
          )
          .pipe(Effect.orDie);
        const staleVector = yield* db.atomicAffected([
          staleAccept.write,
          Proposals.markAcceptedAfterProfileWrite(id, profileId, "2026-08-25T02:00:00.000Z"),
        ]);
        const retried = yield* acceptProposal(
          db,
          profileId,
          id,
          "2026-08-25T02:00:00.001Z",
          (latest) => ({ ...latest, skills: [...latest.skills, "TypeScript"] }),
        );
        const stalePut = yield* Effect.exit(
          profiles.setVersioned(
            profileId,
            { ...sample, headline: "Stale replacement" },
            initial.profileUpdatedAt,
          ),
        );
        return {
          staleVector,
          retried,
          stalePut,
          current: yield* profiles.getVersioned(profileId),
        };
      }),
    );

    expect(result.staleVector).toEqual([0, 0]);
    expect(result.stalePut._tag).toBe("Failure");
    expect(result.current).toEqual(result.retried);
    expect(result.current.profile.summary).toBe("Saved in another tab");
    expect(result.current.profile.skills).toEqual(["Zendesk", "TypeScript"]);
  });

  it("handles missing profiles, both decision orders, and foreign owners with owner-scoped CAS", async () => {
    const result = await run(
      Effect.gen(function* () {
        const db = yield* Database;
        const profiles = yield* Profiles;
        const acceptFirstId = proposalId("sqlite-accept-first");
        const discardFirstId = proposalId("sqlite-discard-first");
        const foreignId = proposalId("sqlite-foreign");
        yield* Proposals.insert(proposal(acceptFirstId, "skills.0", "Accepted"));
        yield* Proposals.insert(proposal(discardFirstId, "skills.1", "Discarded"));
        yield* Proposals.insert(proposal(foreignId, "skills.0", "Private", otherProfileId));

        const accepted = yield* acceptProposal(
          db,
          profileId,
          acceptFirstId,
          "2026-08-25T02:00:00.000Z",
          (current) => ({ ...current, skills: [...current.skills, "Accepted"] }),
        );
        const discardAfterAccept = yield* Proposals.markDiscarded(
          acceptFirstId,
          profileId,
          "2026-08-25T02:00:00.001Z",
        );
        const discarded = yield* Proposals.markDiscarded(
          discardFirstId,
          profileId,
          "2026-08-25T02:00:00.001Z",
        );
        const acceptAfterDiscard = yield* acceptProposal(
          db,
          profileId,
          discardFirstId,
          "2026-08-25T02:00:00.002Z",
          (current) => ({ ...current, skills: [...current.skills, "Discarded"] }),
        );
        const foreignDiscard = yield* Proposals.markDiscarded(
          foreignId,
          profileId,
          "2026-08-25T02:00:00.002Z",
        );
        return {
          accepted,
          discardAfterAccept,
          discarded,
          acceptAfterDiscard,
          foreignDiscard,
          foreignRead: yield* Proposals.findByIdForProfile(foreignId, profileId),
          current: yield* profiles.getVersioned(profileId),
        };
      }),
    );

    expect(result.accepted?.profile.skills).toEqual(["Accepted"]);
    expect(result.discardAfterAccept).toBe(0);
    expect(result.discarded).toBe(1);
    expect(result.acceptAfterDiscard).toBeUndefined();
    expect(result.foreignDiscard).toBe(0);
    expect(result.foreignRead).toBeUndefined();
    expect(result.current.profile.skills).toEqual(["Accepted"]);
  });

  it("rolls back a missing-profile merge when the second decision statement fails", async () => {
    const result = await run(
      Effect.gen(function* () {
        const db = yield* Database;
        const profiles = yield* Profiles;
        const id = proposalId("sqlite-rollback");
        yield* Proposals.insert(proposal(id, "skills.0", "TypeScript"));
        const prepared = profileWriteForPendingProposal(
          profileId,
          { ...sample, skills: ["TypeScript"] },
          id,
          undefined,
          "2026-08-25T02:00:00.000Z",
        );
        const exit = yield* Effect.exit(
          db.atomicAffected([
            prepared.write,
            {
              sql: "UPDATE proposals SET status = 'invalid', decidedAt = ? WHERE id = ? AND profileId = ? AND status = 'pending' AND changes() = 1",
              bindings: ["2026-08-25T02:00:00.000Z", id, profileId],
            },
          ]),
        );
        return {
          exit,
          current: yield* profiles.getVersioned(profileId),
          stored: yield* Proposals.findByIdForProfile(id, profileId),
        };
      }),
    );

    expect(result.exit._tag).toBe("Failure");
    expect(result.current.profileUpdatedAt).toBeNull();
    expect(result.stored?.status).toBe("pending");
  });
});
