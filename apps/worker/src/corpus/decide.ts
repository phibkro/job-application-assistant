import type { CanonicalJob, NormalizedListing, ObservationOutcome } from "@job-index/domain/Job";
import type { SourceId, Sequence } from "@job-index/domain/Ids";
import type { OccurrenceRecord } from "./rows.ts";

/**
 * The pure heart of `observe`: given what the corpus already knows and one
 * new sighting, decide what changed. Everything here is a total function of
 * its arguments — no `Database`, no clock, no I/O — so the deduplication rule
 * ("two adverts for the same vacancy collapse to one canonical job while both
 * occurrences are retained with provenance") is provable with plain objects,
 * and the `Effect`/`Database` shell around it (`observe.ts`) stays a thin,
 * mostly-mechanical translation into SQL reads and writes.
 */
export interface ObservationState {
  /** The canonical job row already stored under `listing.canonicalJobId`, if any. */
  readonly existingCanonical: CanonicalJob | undefined;
  /** The occurrence row already stored under `listing.occurrenceId`, if any. */
  readonly existingOccurrence: OccurrenceRecord | undefined;
  /** Pre-fetched `MAX(sequence) + 1`; consumed only when a canonical row is written. */
  readonly nextSequence: number;
  /** ISO timestamp for this observation, supplied by the caller so this stays pure. */
  readonly now: string;
}

export interface ObservationDecision {
  readonly outcome: ObservationOutcome;
  /** The canonical row as it should read after this observation. */
  readonly canonical: CanonicalJob;
  /** Whether `canonical` differs from `existingCanonical` and must be written. */
  readonly writeCanonical: boolean;
  /** The occurrence row as it should read after this observation. */
  readonly occurrence: OccurrenceRecord;
  readonly writeOccurrence: "insert" | "update";
}

const mergeSources = (
  sources: ReadonlyArray<SourceId>,
  sourceId: SourceId,
): ReadonlyArray<SourceId> => (sources.includes(sourceId) ? sources : [...sources, sourceId]);

const occurrenceRecordFor = (
  listing: NormalizedListing,
  existingOccurrence: OccurrenceRecord | undefined,
  now: string,
): OccurrenceRecord => ({
  id: listing.occurrenceId,
  canonicalJobId: listing.canonicalJobId,
  sourceId: listing.listing.sourceId,
  externalId: listing.listing.externalId,
  contentFingerprint: listing.contentFingerprint,
  firstSeenAt: existingOccurrence?.firstSeenAt ?? now,
  lastSeenAt: now,
});

export const decideObservation = (
  listing: NormalizedListing,
  state: ObservationState,
): ObservationDecision => {
  const { existingCanonical, existingOccurrence, nextSequence, now } = state;
  const raw = listing.listing;
  const occurrence = occurrenceRecordFor(listing, existingOccurrence, now);
  const writeOccurrence: "insert" | "update" =
    existingOccurrence === undefined ? "insert" : "update";

  // No canonical job under this key yet: this observation creates the vacancy.
  // Dominant over every other case, because nothing before it can be true.
  if (existingCanonical === undefined) {
    const canonical: CanonicalJob = {
      id: listing.canonicalJobId,
      title: raw.title,
      employerName: raw.employerName,
      location: raw.location,
      description: raw.description,
      applicationUrl: raw.applicationUrl,
      publishedAt: raw.publishedAt,
      deadline: raw.deadline,
      status: { _tag: "Active" },
      sequence: nextSequence as Sequence,
      changedAt: now,
      sources: [raw.sourceId],
    };
    return {
      outcome: { _tag: "CreatedCanonical", id: canonical.id },
      canonical,
      writeCanonical: true,
      occurrence,
      writeOccurrence,
    };
  }

  const isNewOccurrence = existingOccurrence === undefined;
  const sources = isNewOccurrence
    ? mergeSources(existingCanonical.sources, raw.sourceId)
    : existingCanonical.sources;

  // Every call to `observe` represents a positive sighting: something a
  // source is currently advertising. A canonical previously marked `Closed`
  // therefore always reopens on the next observation, regardless of what
  // else did or didn't change — RFC 0005: "A later active observation
  // reopens it." This is dominant over "new occurrence" / "content changed"
  // because a status transition is the more significant fact to report.
  if (existingCanonical.status._tag === "Closed") {
    const canonical: CanonicalJob = {
      ...existingCanonical,
      title: raw.title,
      employerName: raw.employerName,
      location: raw.location,
      description: raw.description,
      applicationUrl: raw.applicationUrl,
      publishedAt: raw.publishedAt,
      deadline: raw.deadline,
      status: { _tag: "Active" },
      sequence: nextSequence as Sequence,
      changedAt: now,
      sources,
    };
    return {
      outcome: { _tag: "ReopenedCanonical", id: canonical.id },
      canonical,
      writeCanonical: true,
      occurrence,
      writeOccurrence,
    };
  }

  // A source we haven't seen advertise this vacancy before: the cross-source
  // collapse. The canonical's own content is left as the first source
  // reported it — provenance is added, authorship is not renegotiated.
  if (isNewOccurrence) {
    const canonical: CanonicalJob = {
      ...existingCanonical,
      sources,
      sequence: nextSequence as Sequence,
      changedAt: now,
    };
    return {
      outcome: { _tag: "AddedDuplicateOccurrence", id: canonical.id },
      canonical,
      writeCanonical: true,
      occurrence,
      writeOccurrence,
    };
  }

  // The same occurrence, re-observed with different content.
  if (existingOccurrence.contentFingerprint !== listing.contentFingerprint) {
    const canonical: CanonicalJob = {
      ...existingCanonical,
      title: raw.title,
      employerName: raw.employerName,
      location: raw.location,
      description: raw.description,
      applicationUrl: raw.applicationUrl,
      publishedAt: raw.publishedAt,
      deadline: raw.deadline,
      sequence: nextSequence as Sequence,
      changedAt: now,
    };
    return {
      outcome: { _tag: "UpdatedCanonical", id: canonical.id },
      canonical,
      writeCanonical: true,
      occurrence,
      writeOccurrence,
    };
  }

  // The same occurrence, identical content: nothing for a saved search to
  // learn. The occurrence's `lastSeenAt` still advances (a liveness
  // heartbeat, useful to a future absence-detection sweep — see the corpus
  // slot report on `ClosedCanonical`), but the canonical row and its
  // sequence do not move.
  return {
    outcome: { _tag: "Unchanged" },
    canonical: existingCanonical,
    writeCanonical: false,
    occurrence,
    writeOccurrence,
  };
};
