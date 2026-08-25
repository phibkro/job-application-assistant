import * as Schema from "effect/Schema";
import * as Model from "effect/unstable/schema/Model";
import { ProfileId, ProposalId } from "./Ids.ts";

/**
 * A fact about a person, proposed but not yet owned.
 *
 * WS-0015 §3(a): the profile of record has no provenance, and it must never
 * gain one silently — so what a machine reads out of a past document lands
 * here first, marked inferred, and becomes a profile fact only when its owner
 * confirms that one field. The raw document is deliberately absent: this row
 * carries the *conclusion* (one structured value) and its *warrant* (a short
 * quote), never the text it was read from — parse, propose, discard.
 *
 * `status` is a one-way street. `pending` → `accepted` merges the value into
 * the profile through the same `Profiles.set` contract a typed submission
 * uses; `pending` → `discarded` hides the proposal from every reader,
 * forever. No route resurrects a decided row; the table keeps it as audit
 * trail (and erasure removes it with everything else).
 */
export const SourceKind = Schema.Literals(["text", "pdf"]);
export type SourceKind = typeof SourceKind.Type;

export const ProposalStatus = Schema.Literals(["pending", "accepted", "discarded"]);
export type ProposalStatus = typeof ProposalStatus.Type;

/** How sure the engine was, as a label a person reads — not a probability. */
export const Confidence = Schema.Literals(["high", "medium", "low"]);
export type Confidence = typeof Confidence.Type;

/** Which tier produced the proposal, mirroring the drafting generator split. */
export const Engine = Schema.Literals(["heuristic", "model"]);
export type Engine = typeof Engine.Type;

/**
 * Where in the `Profile` a proposal lands. One flat string per proposal (not
 * nested JSON) because the review queue addresses fields one at a time, and
 * because the grammar is closed: `targetOf` below is the total function from
 * path to value schema, and an unknown path fails decode rather than landing
 * somewhere unintended. Array paths address *new items* — accepting appends;
 * existing entries are edited in place by their owner, not re-proposed.
 */
export type FieldPath =
  | "headline"
  | "summary"
  | "location"
  | "languages"
  | `skills.${number}`
  | `education.${number}`
  | `experience.${number}`
  | `preferences.desiredRoles.${number}`
  | `preferences.desiredLocations.${number}`
  | `preferences.excludedTerms.${number}`;

const ExperienceValue = Schema.Struct({
  title: Schema.String,
  employer: Schema.String,
  period: Schema.String,
  highlights: Schema.Array(Schema.String),
});

/**
 * The schema a `proposedValue` must satisfy for a given field path — the one
 * place that knows what `"skills.0"` decodes against, shared by the engines
 * that produce values and the decision endpoint that validates edits.
 */
type ProposalTarget = typeof Schema.String | typeof ExperienceValue;

export const targetOf = (fieldPath: string): ProposalTarget | undefined => {
  switch (fieldPath) {
    case "headline":
    case "summary":
    case "location":
    case "languages":
      return Schema.String;
  }
  if (
    /^(skills|education|preferences\.(desiredRoles|desiredLocations|excludedTerms))\.\d+$/.test(
      fieldPath,
    )
  ) {
    return Schema.String;
  }
  return /^experience\.\d+$/.test(fieldPath) ? ExperienceValue : undefined;
};

/**
 * One proposed fact. `proposedValue` is semantic in memory. The model codec
 * crosses the database boundary as JSON text and decodes it back on select;
 * `fieldPath` names the semantic shape the value must satisfy.
 */
export class Proposal extends Model.Class<Proposal>("Proposal")({
  id: ProposalId,
  profileId: ProfileId,
  /** What kind of past document the fact was read from. */
  sourceKind: SourceKind,
  fieldPath: Schema.String,
  proposedValue: Model.JsonFromString(Schema.Unknown),
  /** The quote from the document this came from, clamped at creation. */
  evidenceExcerpt: Schema.String,
  confidence: Confidence,
  engine: Engine,
  status: ProposalStatus,
  createdAt: Model.DateTimeInsert,
  decidedAt: Model.FieldOption(Schema.String),
}) {}
