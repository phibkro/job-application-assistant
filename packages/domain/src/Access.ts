import * as Schema from "effect/Schema";
import * as Model from "effect/unstable/schema/Model";
import { PrincipalId, ProfileId } from "./Ids.ts";

/**
 * How a caller proves who they are.
 *
 * Two credential kinds over one principal, rather than two auth systems. An
 * API key suits a program; a session suits a browser and a chat, where a
 * long-lived bearer token in local storage is the thing you regret. Both
 * resolve to the same principal, so authorization is written once.
 *
 * DEFAULT TAKEN — revisable before slots open: sessions are opaque server-side
 * records, not signed tokens. Revocation then means deleting a row rather than
 * maintaining a deny-list, which matters for a product holding people's CVs.
 */
export const Credential = Schema.Union([
  Schema.TaggedStruct("ApiKey", { principal: PrincipalId }),
  Schema.TaggedStruct("Session", { principal: PrincipalId, session: Schema.String }),
]);
export type Credential = typeof Credential.Type;

export class Session extends Model.Class<Session>("Session")({
  id: Schema.String,
  principalId: PrincipalId,
  profileId: ProfileId,
  /** Stored hashed, and never returned: possession of the row must not grant access. */
  tokenHash: Model.Sensitive(Schema.String),
  /** Absolute, not sliding; a stolen session should stop working on its own. */
  expiresAt: Schema.Number,
  createdAt: Model.DateTimeInsert,
  revokedAt: Model.FieldOption(Schema.String),
}) {}

/**
 * The right to erasure, as a state the schema can express.
 *
 * DEFAULT TAKEN: a request marks the profile immediately and blocks all access;
 * personal rows are purged by a scheduled sweep after a short grace period, so
 * an accidental request is recoverable and a genuine one completes without
 * anyone running a script. What survives is non-personal: aggregate counts and
 * audit entries with the subject removed, because deleting the audit trail of a
 * deletion is its own problem.
 */
export const Erasure = Schema.Union([
  Schema.TaggedStruct("Active", {}),
  Schema.TaggedStruct("Requested", { at: Schema.String, purgeAfter: Schema.String }),
  Schema.TaggedStruct("Purged", { at: Schema.String }),
]);
export type Erasure = typeof Erasure.Type;

/**
 * How long a purge sweep must wait after a request before it may delete the
 * row: the gap between `Requested.at` and `Requested.purgeAfter`.
 *
 * DEFAULT TAKEN, not sourced: WS-0012 lists "erasure and retention policy —
 * what deletion means, and after how long" as an operator decision, and
 * nothing in the frozen contracts states a duration. Thirty days matches
 * common GDPR-erasure grace windows and is easy to change in one place; it is
 * a placeholder for an answer no slot can source on its own, not a policy
 * claim. It lives beside `Erasure` rather than in whichever slot happens to
 * compute the first `purgeAfter`, because a grace period is a policy every
 * writer of that field must agree on, not an implementation detail of one.
 */
export const ERASURE_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
