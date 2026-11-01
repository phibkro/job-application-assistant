import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import * as Schema from "effect/Schema";

/**
 * The listing observation IR, version 0. **Stability: experimental** (owner decision 2026-11-01, lead handoff
 * "Stability"): it is promoted to *candidate* once two different adapters fit it unchanged, and to *stable* once an
 * external client depends on it. Until then any field may change, through a new `irVersion` and a pure migration
 * (`decodeObservationContent` below is the migrate-by-decode boundary, the effx `migrate.ts` pattern).
 *
 * Shape (lead handoff, "IR shape"): **homogeneous shape, heterogeneous content.** Every observation from every source
 * fills the same closed set of `Fact<T>` attributes, named after schema.org `JobPosting`. Source variance lives only in
 * each fact's `state` and `evidence`; content a mapping does not consume goes to a uniform `residue: RawClaim[]`, never
 * into per-source keys.
 *
 * An observation is what was *received* (D06, WS-0024): it is content-addressed (`observationId`), carries the source's
 * own clock (`dateModified`, valid time) and, once stored, its recorded time (`Recorded`). Derived facts such as
 * workload belong to versioned passes over observations (`Workload.ts`), not to the observation itself.
 *
 * Pure: no Effect services (WS-0022 §8, enforced by `observation/boundary.test.ts`).
 */
export const IR_VERSION = 0 as const;
export const IR_STABILITY = "experimental" as const;

/**
 * The seven fact states (D06). `Stated` and `Derived` are *determined*: they carry a value. The other five never carry
 * one, so an absent value cannot be read as a default (missing ≠ 100 %).
 *
 * - `Stated`: the source states the value.
 * - `Derived`: the value follows from source content by a declared method (e.g. a percentage in free text).
 * - `Negotiable`: the source says the value is open ("etter avtale").
 * - `Conflicting`: the evidence disagrees.
 * - `Unknown`: the source could have stated it and did not.
 * - `TempUnknown`: not available yet (e.g. only a feed summary has been received; FHIR `temp-unknown`).
 * - `Unsupported`: the source's structured schema cannot carry it (e.g. NAV `Deltid` with no percentage field).
 */
export const FACT_STATES = [
  "Stated",
  "Derived",
  "Negotiable",
  "Conflicting",
  "Unknown",
  "TempUnknown",
  "Unsupported",
] as const;
export const FactState = Schema.Literals(FACT_STATES);
export type FactState = typeof FactState.Type;

export const isDetermined = (state: FactState): boolean =>
  state === "Stated" || state === "Derived";

/** `name@version`, e.g. `nav-import@0`, `workload@1`: which versioned method produced a fact. */
export const Method = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]*@\d+$/));

/**
 * `Fact<T>`: one attribute of one observation. Evidence is never empty (L1 guarantee 4): a fact with no evidence is a
 * claim nobody can check. A value is present exactly when the state is determined.
 */
const valuePresentExactlyWhenDetermined = Schema.makeFilter(
  (fact: { readonly state: FactState; readonly value?: unknown }) =>
    isDetermined(fact.state) === (fact.value !== undefined) ||
    "a fact carries a value exactly when its state is Stated or Derived",
);

const factFields = <S extends Schema.Constraint>(value: S) => ({
  state: FactState,
  value: Schema.optionalKey(value),
  evidence: Schema.Array(Schema.String).check(Schema.isMinLength(1)),
  method: Method,
});

/** A `Fact` over a string value (every attribute but `totalJobOpenings`). */
export const TextFact = Schema.Struct(factFields(Schema.String)).check(
  valuePresentExactlyWhenDetermined,
);
/** A `Fact` over a positive count (`totalJobOpenings`, NAV `positioncount`). */
export const CountFact = Schema.Struct(
  factFields(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
).check(valuePresentExactlyWhenDetermined);

export interface Fact<T> {
  readonly state: FactState;
  readonly value?: T;
  readonly evidence: ReadonlyArray<string>;
  readonly method: string;
}

/** One unmapped leaf of a source payload, by its stable path (`ad_content.workLocations[0].city`). */
export const RawClaim = Schema.Struct({ path: Schema.String, value: Schema.String });
export type RawClaim = typeof RawClaim.Type;

/**
 * The closed attribute set, schema.org `JobPosting` names. Adding an attribute is an IR version change.
 *
 * `hiringOrganization` is the organisation's name and `taxID` its organisation number (schema.org nests both under
 * `hiringOrganization`; flattened here so every attribute is one `Fact`). `employmentType` is the source's own schedule
 * category text (NAV `extent`: `Heltid`/`Deltid`), never a derived FTE: the workload pass derives that.
 */
export const ListingFacts = Schema.Struct({
  title: TextFact,
  hiringOrganization: TextFact,
  taxID: TextFact,
  jobLocation: TextFact,
  url: TextFact,
  description: TextFact,
  employmentType: TextFact,
  totalJobOpenings: CountFact,
  datePosted: TextFact,
  validThrough: TextFact,
});
export type ListingFacts = typeof ListingFacts.Type;
export type Attribute = keyof ListingFacts;
export const ATTRIBUTES: ReadonlyArray<Attribute> = Object.keys(
  ListingFacts.fields,
) as ReadonlyArray<Attribute>;

/**
 * What was received: a feed summary, a full advert, or a status-only answer (NAV's detail endpoint for a closed advert
 * returns `{uuid, sistEndret, status}` and no content). Only a `Detail` carries advert content.
 */
export const ObservationKind = Schema.Literals(["FeedEntry", "Detail", "StatusOnly"]);
export type ObservationKind = typeof ObservationKind.Type;

/** IR v0 content: what an importer emits. Content-addressed; carries no receipt time. */
export const ObservationContentV0 = Schema.Struct({
  irVersion: Schema.Literal(0),
  source: Schema.NonEmptyString,
  externalId: Schema.NonEmptyString,
  kind: ObservationKind,
  /** The source's status, upper-cased (`ACTIVE`, `INACTIVE`, ...). Only `ACTIVE` is active. */
  status: Schema.NonEmptyString,
  /** The source's own modification clock: the valid-time ordering key. Absent sorts before every present value. */
  dateModified: Schema.optionalKey(Schema.String),
  facts: ListingFacts,
  residue: Schema.Array(RawClaim),
});
export type ObservationContent = typeof ObservationContentV0.Type;

/**
 * Migrate-by-decode: every persisted IR version decodes here and comes out as the current version. Only v0 exists, so
 * the union has one member; a v1 adds its own member plus a pure `v0 → v1` transformation, and old rows keep decoding.
 */
export const ObservationContent = Schema.Union([ObservationContentV0]);
export const decodeObservationContent = Schema.decodeUnknownResult(ObservationContent);
export const encodeObservationContent = Schema.encodeSync(ObservationContent);

/** When and by which run the store first recorded an observation. Assigned by the store, never by an importer. */
export const Recorded = Schema.Struct({
  /** Monotonic per store: the recorded-time axis. As-of `t` means `recordedSeq <= t`. */
  recordedSeq: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  recordedAt: Schema.String,
  runId: Schema.String,
});
export type Recorded = typeof Recorded.Type;

export const ListingObservation = Schema.Struct({
  id: Schema.String,
  content: ObservationContent,
  recorded: Recorded,
});
export type ListingObservation = typeof ListingObservation.Type;

/** JSON with object keys sorted at every level, so equal values always serialise to equal text. */
export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

/**
 * The content address: SHA-256 of the canonical JSON of the encoded content. Identical content ⇒ identical id, so an
 * identical replay is an insert-or-ignore no-op (F2). Recorded time is not part of the content.
 *
 * ```ts
 * observationIdOf({ b: 1, a: [2] }) === observationIdOf({ a: [2], b: 1 }) // => true
 * observationIdOf({ a: 1 }).length // => 64
 * ```
 */
export const observationIdOf = (encodedContent: unknown): string =>
  bytesToHex(sha256(utf8ToBytes(canonicalJson(encodedContent))));

export const observationId = (content: ObservationContent): string =>
  observationIdOf(encodeObservationContent(content));

/** Builds a fact; `value` only for the determined states (the schema rejects anything else). */
export const fact = <T>(
  state: FactState,
  method: string,
  evidence: ReadonlyArray<string>,
  value?: T,
): Fact<T> =>
  value === undefined ? { state, evidence, method } : { state, value, evidence, method };
