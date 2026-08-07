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

/** `createdAt` is set once at insert; a profile update never touches it. */
const PROFILE_UPDATE_FIELDS = PROFILE_FIELDS.filter(
  (field) => field !== "profileId" && field !== "createdAt",
);

const columns = (fields: ReadonlyArray<string>): string => fields.join(", ");

const placeholders = (fields: ReadonlyArray<string>): string => fields.map(() => "?").join(", ");

export const FIND_PROFILE_ROW = `-- accounts:findProfileRow\nSELECT ${columns(PROFILE_FIELDS)} FROM profiles WHERE profileId = ?`;

export const INSERT_PROFILE = `-- accounts:insertProfile\nINSERT INTO profiles (${columns(PROFILE_FIELDS)}) VALUES (${placeholders(PROFILE_FIELDS)})`;

export const UPDATE_PROFILE = `-- accounts:updateProfile\nUPDATE profiles SET ${PROFILE_UPDATE_FIELDS.map((field) => `${field} = ?`).join(", ")} WHERE profileId = ?`;

export const FIND_PRINCIPAL_BY_API_KEY_HASH = `-- accounts:findPrincipalByApiKeyHash\nSELECT ${columns(PRINCIPAL_FIELDS)} FROM principals WHERE apiKeyHash = ?`;

export const PROFILE_FOR_PRINCIPAL = `-- accounts:profileForPrincipal\nSELECT profileId FROM principals WHERE principalId = ?`;
