import * as Schema from "effect/Schema";
import * as Model from "effect/unstable/schema/Model";
import { ProfileId } from "./Ids.ts";

/**
 * What the account has paid for.
 *
 * DEFAULT TAKEN: billing is a port, like ingestion and delivery. The domain
 * knows a subscription has a tier, a period, and a provider reference; it does
 * not know Stripe. That keeps the provider swappable and, more usefully, keeps
 * the entitlement decision testable without a payment sandbox.
 */
export const Tier = Schema.Union([
  Schema.TaggedStruct("Free", {}),
  Schema.TaggedStruct("Premium", { until: Schema.String }),
]);
export type Tier = typeof Tier.Type;

/**
 * Capabilities are named, not derived from tier at the call site.
 *
 * Adding one should not require every gate to learn a new tier, and a test
 * should be able to grant exactly one capability.
 */
export const Capability = Schema.Literals([
  "model-drafting",
  "automated-apply",
  "agent-acquisition",
  "scheduled-applications",
]);
export type Capability = typeof Capability.Type;

export class Subscription extends Model.Class<Subscription>("Subscription")({
  profileId: ProfileId,
  tier: Model.JsonFromString(Tier),
  /** Opaque provider identifier; the domain never interprets it. */
  providerRef: Model.Sensitive(Schema.String),
  provider: Schema.Literals(["none", "stripe"]),
  updatedAt: Model.DateTimeUpdate,
}) {}
