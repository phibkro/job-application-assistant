import * as Schema from "effect/Schema";
import * as Model from "effect/unstable/schema/Model";

/**
 * The four tables Better Auth's core (not a plugin) reads and writes,
 * declared as `Model.Class`es rather than left for Better Auth's own `npx
 * better-auth generate` to own.
 *
 * Field names, nullability, and which tables exist here are sourced from
 * `@better-auth/core`'s own schema (`getAuthTables({})`, better-auth
 * 1.6.26) — not guessed. Column *types* are a separate, sourced decision:
 * this adapter runs with `supportsJSON`/`supportsDates`/`supportsBooleans`
 * all `false` (see `Adapter.ts`), so Better Auth itself hands the SQL layer
 * strings and `0`/`1` — never a `Date` or a JS `boolean` — which is why every
 * timestamp below is `Model.DateTimeUpdate`/`DateTimeInsert` (string-backed)
 * and `emailVerified` is `Model.BooleanSqlite` rather than `Schema.Boolean`.
 *
 * A consumer's own `scripts/*.ts`-style generator reads these the same way
 * `job-index`'s does — via `.fields`/`.select.fields` — to emit `CREATE
 * TABLE`, so the adapter and the migration both read from one declaration
 * instead of Better Auth's CLI generator and a hand-written schema
 * disagreeing about a column.
 */

export class User extends Model.Class<User>("BetterAuthUser")({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  emailVerified: Model.BooleanSqlite,
  image: Model.FieldOption(Schema.String),
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
}) {}

export class Session extends Model.Class<Session>("BetterAuthSession")({
  id: Schema.String,
  userId: Schema.String,
  token: Schema.String,
  /** ISO string: see the module doc on `supportsDates`. Expiry is ordinary mutable data, not insert/update housekeeping. */
  expiresAt: Schema.String,
  ipAddress: Model.FieldOption(Schema.String),
  userAgent: Model.FieldOption(Schema.String),
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
}) {}

export class Account extends Model.Class<Account>("BetterAuthAccount")({
  id: Schema.String,
  userId: Schema.String,
  providerId: Schema.String,
  accountId: Schema.String,
  /** Credential-adjacent: `Sensitive` keeps these out of every JSON variant, the same way this repo's own `Session.tokenHash` does. */
  accessToken: Model.Sensitive(Schema.NullOr(Schema.String)),
  refreshToken: Model.Sensitive(Schema.NullOr(Schema.String)),
  idToken: Model.Sensitive(Schema.NullOr(Schema.String)),
  accessTokenExpiresAt: Model.FieldOption(Schema.String),
  refreshTokenExpiresAt: Model.FieldOption(Schema.String),
  scope: Model.FieldOption(Schema.String),
  password: Model.Sensitive(Schema.NullOr(Schema.String)),
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
}) {}

export class Verification extends Model.Class<Verification>("BetterAuthVerification")({
  id: Schema.String,
  identifier: Schema.String,
  value: Schema.String,
  expiresAt: Schema.String,
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
}) {}
