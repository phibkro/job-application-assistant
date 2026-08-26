/**
 * The `profiles`/`principals` statements this slot sends through `Database`.
 *
 * Column lists come from the domain models' field order rather than typed
 * out by hand — the same order `scripts/ts/schema.ts` reads to generate
 * `db/schema.sql` — so a statement cannot name a column the table lacks, and
 * a field added to the model cannot leave a stale statement behind.
 *
 * Each statement keeps its leading `-- accounts:<op>` comment (valid SQL,
 * harmless against a real connection): `fixtures.ts`'s fake `Database`
 * switches on that tag rather than parsing SQL, so the tag stays the fake's
 * contract even though the text after it is generated.
 */
import { ProfileRecord } from "@job-index/domain/Profile";
import { Principal } from "@job-index/domain/Principal";

export const PROFILE_FIELDS = Object.keys(ProfileRecord.select.fields) as ReadonlyArray<string>;

export const PRINCIPAL_FIELDS = Object.keys(Principal.select.fields) as ReadonlyArray<string>;

/** `createdAt` and consent are set independently; a profile update never touches either. */
const PROFILE_UPDATE_FIELDS = PROFILE_FIELDS.filter(
  (field) => field !== "profileId" && field !== "createdAt" && field !== "aiAssist",
);

const columns = (fields: ReadonlyArray<string>): string => fields.join(", ");

const placeholders = (fields: ReadonlyArray<string>): string => fields.map(() => "?").join(", ");

export const FIND_PROFILE_ROW = `-- accounts:findProfileRow\nSELECT ${columns(PROFILE_FIELDS)} FROM profiles WHERE profileId = ?`;

export const INSERT_PROFILE = `-- accounts:insertProfile\nINSERT INTO profiles (${columns(PROFILE_FIELDS)}) VALUES (${placeholders(PROFILE_FIELDS)})`;

export const UPDATE_PROFILE = `-- accounts:updateProfile\nUPDATE profiles SET ${PROFILE_UPDATE_FIELDS.map((field) => `${field} = ?`).join(", ")} WHERE profileId = ?`;

/** Consent is independent from the CV revision and applies only to a live profile. */
export const UPDATE_AI_CONSENT = `-- accounts:updateAiConsent\nUPDATE profiles SET aiAssist = ? WHERE profileId = ? AND erasure = ?`;

/** Whole-profile optimistic replacement when the caller observed no row. */
export const INSERT_PROFILE_IF_MISSING = `-- accounts:insertProfileIfMissing\nINSERT INTO profiles (${columns(PROFILE_FIELDS)}) SELECT ${placeholders(PROFILE_FIELDS)} WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE profileId = ?)`;

/** Whole-profile optimistic replacement when the caller observed this version. */
export const UPDATE_PROFILE_IF_VERSION = `-- accounts:updateProfileIfVersion\nUPDATE profiles SET cv = ?, updatedAt = ? WHERE profileId = ? AND updatedAt = ? AND erasure = ?`;

/**
 * Profile-first proposal acceptance. The prior CV and version are both part
 * of the compare-and-swap, and the owner-scoped pending proposal must still
 * exist at the same transaction snapshot.
 */
export const UPDATE_PROFILE_FOR_PENDING_PROPOSAL = `-- accounts:updateProfileForPendingProposal\nUPDATE profiles SET cv = ?, updatedAt = ? WHERE profileId = ? AND cv = ? AND updatedAt = ? AND erasure = ? AND EXISTS (SELECT 1 FROM proposals WHERE id = ? AND profileId = ? AND status = 'pending')`;

/** Missing profiles merge from `emptyProfile` and insert only while the same owner-scoped proposal is pending. */
export const INSERT_PROFILE_FOR_PENDING_PROPOSAL = `-- accounts:insertProfileForPendingProposal\nINSERT INTO profiles (${columns(PROFILE_FIELDS)}) SELECT ${placeholders(PROFILE_FIELDS)} WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE profileId = ?) AND EXISTS (SELECT 1 FROM proposals WHERE id = ? AND profileId = ? AND status = 'pending')`;

export const FIND_PRINCIPAL_BY_API_KEY_HASH = `-- accounts:findPrincipalByApiKeyHash\nSELECT ${columns(PRINCIPAL_FIELDS)} FROM principals WHERE apiKeyHash = ?`;

export const PROFILE_FOR_PRINCIPAL = `-- accounts:profileForPrincipal\nSELECT profileId FROM principals WHERE principalId = ?`;
