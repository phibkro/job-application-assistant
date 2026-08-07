import * as Schema from "effect/Schema";
import * as Model from "effect/unstable/schema/Model";
import { PrincipalId, ProfileId } from "./Ids.ts";

/**
 * What a presented credential resolves to.
 *
 * The previous implementation stored this and the new domain lost it, so the
 * accounts slot had to assume a table to authenticate against. A credential
 * that cannot be resolved to an identity is not a credential.
 *
 * Only the hash is kept. The service therefore cannot return a key, which is
 * what makes "we cannot recover it, only reissue" true by construction rather
 * than by policy.
 */
export class Principal extends Model.Class<Principal>("Principal")({
  principalId: PrincipalId,
  profileId: ProfileId,
  apiKeyHash: Model.Sensitive(Schema.String),
  /** A revoked principal authenticates as nothing, and the row is retained. */
  revokedAt: Model.FieldOption(Schema.String),
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
}) {}
