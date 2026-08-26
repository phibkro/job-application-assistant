import * as Effect from "effect/Effect";
import * as VariantSchema from "effect/unstable/schema/VariantSchema";
import { Proposal } from "@job-index/domain/Proposals";
import type { ProfileId, ProposalId } from "@job-index/domain/Ids";
import { Database } from "../../services/Database.ts";
import type { Write } from "../../services/Database.ts";
import {
  columnsOf,
  decodeRow,
  decodeRows,
  deleteStatement,
  encodeVariant,
  insertStatement,
} from "../Sql.ts";

const TABLE = "proposals";

/**
 * The staging area between a machine's reading of a past document and the
 * person's own profile (WS-0015 S1). Writes happen exactly twice per row:
 * once when proposed (`pending`), once when decided — and a decision is a
 * state transition the service layer owns, which is why this module exposes
 * no generic update: every mutation after insert goes through
 * `markDecided`, and only with an explicit status.
 */
export const insert = (proposal: Proposal): Effect.Effect<void, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const insertable = yield* Proposal.insert
      .makeEffect({
        ...proposal,
        createdAt: VariantSchema.Override(proposal.createdAt),
      })
      .pipe(Effect.orDie);
    const encoded = yield* encodeVariant(Proposal.insert)(insertable);
    const stmt = insertStatement(TABLE, columnsOf(Proposal.insert), encoded);
    yield* db.run(stmt.sql, stmt.bindings);
  });

export const findById = (id: ProposalId): Effect.Effect<Proposal | undefined, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(`SELECT * FROM ${TABLE} WHERE id = ?`, [id]);
    return rows[0] === undefined ? undefined : yield* decodeRow<Proposal>(Proposal)(rows[0]);
  });

/** Owner-scoped lookup used for every decision and decision-conflict reread. */
export const findByIdForProfile = (
  id: ProposalId,
  profileId: ProfileId,
): Effect.Effect<Proposal | undefined, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(`SELECT * FROM ${TABLE} WHERE id = ? AND profileId = ?`, [
      id,
      profileId,
    ]);
    return rows[0] === undefined ? undefined : yield* decodeRow<Proposal>(Proposal)(rows[0]);
  });

/** Pending proposals only — decided rows are audit trail no route serves. */
export const findPendingByProfile = (
  profileId: ProfileId,
): Effect.Effect<ReadonlyArray<Proposal>, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(
      `SELECT * FROM ${TABLE} WHERE profileId = ? AND status = 'pending' ORDER BY createdAt DESC`,
      [profileId],
    );
    return yield* decodeRows<Proposal>(Proposal)(rows);
  });

/**
 * Proposal follower for profile-first acceptance. `changes()` is the affected
 * count of the immediately preceding profile CAS in the same atomic batch.
 */
export const markAcceptedAfterProfileWrite = (
  id: ProposalId,
  profileId: ProfileId,
  decidedAt: string,
): Write => ({
  sql: `UPDATE ${TABLE} SET status = 'accepted', decidedAt = ? WHERE id = ? AND profileId = ? AND status = 'pending' AND changes() = 1`,
  bindings: [decidedAt, id, profileId],
});

/** Owner-scoped pending→discarded compare-and-swap. */
export const markDiscarded = (
  id: ProposalId,
  profileId: ProfileId,
  decidedAt: string,
): Effect.Effect<number, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    return yield* db.runAffected(
      `UPDATE ${TABLE} SET status = 'discarded', decidedAt = ? WHERE id = ? AND profileId = ? AND status = 'pending'`,
      [decidedAt, id, profileId],
    );
  });

/**
 * Erasure support. A proposal row is derived, owner-scoped personal data —
 * the value plus the quote it came from are exactly what erasure exists to
 * remove once the profile goes. Registered in `db/Erase.ts`'s purge list.
 */
export const deleteByProfileWrite = (profileId: ProfileId): Write =>
  deleteStatement(TABLE, { profileId });

/**
 * WS-0019 workspace export: every proposal of the profile regardless of
 * status — decided rows are audit trail no *route* serves, but they are
 * account-registered personal data, so export covers them.
 */
export const findByProfile = (
  profileId: ProfileId,
): Effect.Effect<ReadonlyArray<Proposal>, never, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const rows = yield* db.query<unknown>(
      `SELECT * FROM ${TABLE} WHERE profileId = ? ORDER BY createdAt DESC, id ASC`,
      [profileId],
    );
    return yield* decodeRows<Proposal>(Proposal)(rows);
  });
