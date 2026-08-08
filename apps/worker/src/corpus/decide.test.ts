import { describe, expect, it } from "vitest";
import type { CanonicalJob, NormalizedListing, RawListing } from "@job-index/domain/Job";
import type { CanonicalJobId, PlatformId, SourceId } from "@job-index/domain/Ids";
import { normalize } from "./identity.ts";
import { decideObservation, type ObservationState } from "./decide.ts";
import type { OccurrenceRecord } from "./rows.ts";

/**
 * `hydrated: true` by default: most of this file's cases are about identity
 * and merge mechanics unrelated to deferred hydration, and defaulting to
 * "already hydrated" (as if a detail fetch already ran) is what keeps every
 * pre-existing `description` assertion meaningful without threading
 * hydration state through every case. The hydration-specific cases below
 * override it explicitly.
 */
const raw = (overrides: Partial<RawListing> = {}): RawListing => ({
  sourceId: "nav" as SourceId,
  sourceName: "NAV",
  platformId: "arbeidsplassen-nav" as PlatformId,
  externalId: "1",
  title: "Baker",
  employerName: "Bakery AS",
  location: "Oslo",
  description: "Bakes bread.",
  applicationUrl: "https://example.com/job/1",
  publishedAt: "2026-01-01T00:00:00Z",
  hydrated: true,
  ...overrides,
});

/** `CanonicalJob.hydration`'s `description`, or `undefined` if unhydrated — a test-only convenience, not a domain-level shortcut. */
const descriptionOf = (job: CanonicalJob): string | undefined =>
  job.hydration._tag === "Hydrated" ? job.hydration.description : undefined;

const emptyState = (nextSequence = 1): ObservationState => ({
  existingCanonical: undefined,
  existingOccurrence: undefined,
  nextSequence,
  now: "2026-01-02T00:00:00Z",
});

describe("decideObservation", () => {
  it("creates a canonical job for a vacancy never seen before", () => {
    const listing = normalize(raw());
    const decision = decideObservation(listing, emptyState(7));
    expect(decision.outcome).toEqual({ _tag: "CreatedCanonical", id: listing.canonicalJobId });
    expect(decision.writeCanonical).toBe(true);
    expect(decision.writeOccurrence).toBe("insert");
    expect(decision.canonical.sequence).toBe(7);
    expect(decision.canonical.sources).toEqual(["nav"]);
  });

  it("re-observing the identical occurrence with identical content is Unchanged and does not move the sequence", () => {
    const listing = normalize(raw());
    const created = decideObservation(listing, emptyState());
    const state: ObservationState = {
      existingCanonical: created.canonical,
      existingOccurrence: created.occurrence,
      nextSequence: 99,
      now: "2026-01-03T00:00:00Z",
    };
    const decision = decideObservation(listing, state);
    expect(decision.outcome).toEqual({ _tag: "Unchanged" });
    expect(decision.writeCanonical).toBe(false);
    expect(decision.canonical.sequence).toBe(created.canonical.sequence);
    // The occurrence heartbeat still advances even though nothing canonical changed.
    expect(decision.occurrence.lastSeenAt).toBe("2026-01-03T00:00:00Z");
    expect(decision.occurrence.firstSeenAt).toBe(created.occurrence.firstSeenAt);
  });

  it("re-observing the identical occurrence with changed content is UpdatedCanonical", () => {
    const listing = normalize(raw());
    const created = decideObservation(listing, emptyState());
    const revised = normalize(raw({ description: "Bakes bread and pastries." }));
    const state: ObservationState = {
      existingCanonical: created.canonical,
      existingOccurrence: created.occurrence,
      nextSequence: 8,
      now: "2026-01-03T00:00:00Z",
    };
    const decision = decideObservation(revised, state);
    expect(decision.outcome).toEqual({ _tag: "UpdatedCanonical", id: listing.canonicalJobId });
    expect(descriptionOf(decision.canonical)).toBe("Bakes bread and pastries.");
    expect(decision.canonical.sequence).toBe(8);
    expect(decision.writeOccurrence).toBe("update");
  });

  it("a new source occurrence for a vacancy already known is AddedDuplicateOccurrence, and both occurrences are retained", () => {
    const first = normalize(raw({ sourceId: "nav" as SourceId, externalId: "1" }));
    const created = decideObservation(first, emptyState());

    // A different source, same title/employer/location: the dedup key matches.
    const second = normalize(
      raw({
        sourceId: "webcruiter" as SourceId,
        externalId: "999",
        title: "Baker",
        employerName: "Bakery AS",
        location: "Oslo",
      }),
    );
    expect(second.canonicalJobId).toBe(first.canonicalJobId);

    const state: ObservationState = {
      existingCanonical: created.canonical,
      existingOccurrence: undefined, // a different occurrenceId, never seen
      nextSequence: 12,
      now: "2026-01-04T00:00:00Z",
    };
    const decision = decideObservation(second, state);
    expect(decision.outcome).toEqual({
      _tag: "AddedDuplicateOccurrence",
      id: first.canonicalJobId,
    });
    expect(decision.canonical.sources).toEqual(["nav", "webcruiter"]);
    expect(decision.writeOccurrence).toBe("insert");
    // The canonical's own displayed content is unchanged — authorship stays with the first source.
    expect(decision.canonical.title).toBe(created.canonical.title);
  });

  it("adding the same source a second time does not duplicate provenance", () => {
    const first = normalize(raw());
    const created = decideObservation(first, emptyState());
    const canonicalWithNavTwice: CanonicalJob = {
      ...created.canonical,
      sources: ["nav" as SourceId],
    };
    const state: ObservationState = {
      existingCanonical: canonicalWithNavTwice,
      existingOccurrence: undefined,
      nextSequence: 3,
      now: "2026-01-04T00:00:00Z",
    };
    const decision = decideObservation(first, state);
    expect(decision.canonical.sources).toEqual(["nav"]);
  });

  it("a closed canonical reopens on the next observation, even from the same occurrence", () => {
    const listing = normalize(raw());
    const closedCanonical: CanonicalJob = {
      id: listing.canonicalJobId,
      title: "Baker",
      employerName: "Bakery AS",
      location: "Oslo",
      applicationUrl: "https://example.com/job/1",
      publishedAt: "2026-01-01T00:00:00Z",
      status: { _tag: "Closed", closedAt: "2026-01-05T00:00:00Z" },
      sequence: 4 as CanonicalJob["sequence"],
      changedAt: "2026-01-05T00:00:00Z",
      sources: ["nav" as SourceId],
      hydration: { _tag: "Hydrated", description: "Bakes bread." },
    };
    const existingOccurrence: OccurrenceRecord = {
      id: listing.occurrenceId,
      canonicalJobId: listing.canonicalJobId,
      sourceId: "nav" as SourceId,
      platformId: "arbeidsplassen-nav" as PlatformId,
      externalId: "1",
      contentFingerprint: listing.contentFingerprint,
      active: false,
      firstSeenAt: "2026-01-01T00:00:00Z",
      lastSeenAt: "2026-01-05T00:00:00Z",
    };
    const state: ObservationState = {
      existingCanonical: closedCanonical,
      existingOccurrence,
      nextSequence: 5,
      now: "2026-01-06T00:00:00Z",
    };
    const decision = decideObservation(listing, state);
    expect(decision.outcome).toEqual({ _tag: "ReopenedCanonical", id: listing.canonicalJobId });
    expect(decision.canonical.status).toEqual({ _tag: "Active" });
    expect(decision.canonical.sequence).toBe(5);
  });

  /**
   * Pins the exact guarantee the task hands down: three source
   * advertisements, two of which describe the same real vacancy, fold to two
   * canonical jobs with one duplicate merged — folded purely, one
   * `decideObservation` call per advert, threading each decision's canonical
   * row into the next call's state exactly as `observe.ts` will via `Database`.
   */
  it("3 source ads become 2 canonical jobs, 1 duplicate merged", () => {
    const adA = normalize(
      raw({
        sourceId: "nav" as SourceId,
        externalId: "1",
        title: "Baker",
        employerName: "Bakery AS",
        location: "Oslo",
      }),
    );
    const adB = normalize(
      raw({
        sourceId: "nav" as SourceId,
        externalId: "2",
        title: "Warehouse Operative",
        employerName: "Nordic Logistics AS",
        location: "Bergen",
      }),
    );
    // Same real vacancy as adA, advertised by a second platform under a
    // completely different externalId and URL.
    const adC = normalize(
      raw({
        sourceId: "webcruiter" as SourceId,
        externalId: "wc-77",
        title: "Baker",
        employerName: "Bakery AS",
        location: "Oslo",
        applicationUrl: "https://webcruiter.example/ads/77",
      }),
    );

    const store = new Map<CanonicalJobId, CanonicalJob>();
    const occurrences = new Map<string, OccurrenceRecord>();
    let sequence = 1;

    const observe = (listing: NormalizedListing) => {
      const decision = decideObservation(listing, {
        existingCanonical: store.get(listing.canonicalJobId),
        existingOccurrence: occurrences.get(listing.occurrenceId),
        nextSequence: sequence,
        now: "2026-01-02T00:00:00Z",
      });
      if (decision.writeCanonical) {
        store.set(decision.canonical.id, decision.canonical);
        sequence += 1;
      }
      occurrences.set(decision.occurrence.id, decision.occurrence);
      return decision.outcome;
    };

    const outcomeA = observe(adA);
    const outcomeB = observe(adB);
    const outcomeC = observe(adC);

    expect(outcomeA).toEqual({ _tag: "CreatedCanonical", id: adA.canonicalJobId });
    expect(outcomeB).toEqual({ _tag: "CreatedCanonical", id: adB.canonicalJobId });
    expect(outcomeC).toEqual({ _tag: "AddedDuplicateOccurrence", id: adA.canonicalJobId });

    expect(store.size).toBe(2); // 3 ads, 2 canonical jobs
    expect(occurrences.size).toBe(3); // both source occurrences retained
    expect(store.get(adA.canonicalJobId)?.sources).toEqual(["nav", "webcruiter"]);
  });

  /**
   * The property deferred hydration rests on: NAV's feed sweeps a still-open
   * vacancy every ~15 minutes forever, always with `hydrated: false`. If a
   * feed-only re-observation ever overwrote a previously hydrated
   * description, everything `Hydration.hydrate` wrote would be erased by the
   * very next sweep — see `hydrationFor`'s doc comment in `decide.ts`.
   */
  describe("hydration state across re-observation", () => {
    it("a feed-only observation of a brand-new vacancy starts Unhydrated", () => {
      const listing = normalize(raw({ hydrated: false }));
      const decision = decideObservation(listing, emptyState());
      expect(decision.canonical.hydration).toEqual({ _tag: "Unhydrated" });
    });

    it("a scripted adapter's one-shot scrape (hydrated: true) starts Hydrated", () => {
      const listing = normalize(raw({ hydrated: true, description: "Full advert text." }));
      const decision = decideObservation(listing, emptyState());
      expect(decision.canonical.hydration).toEqual({
        _tag: "Hydrated",
        description: "Full advert text.",
        deadline: undefined,
      });
    });

    it("a feed-only re-observation with changed content does not downgrade an already-hydrated job", () => {
      const listing = normalize(raw({ hydrated: false }));
      const created = decideObservation(listing, emptyState());
      const hydratedCanonical: CanonicalJob = {
        ...created.canonical,
        hydration: { _tag: "Hydrated", description: "Fetched via Hydration.hydrate." },
      };

      // The feed moved the employer name — a genuine content change — but
      // this observation is still feed-only (`hydrated: false`).
      const revised = normalize(raw({ hydrated: false, employerName: "Bakery Norge AS" }));
      const state: ObservationState = {
        existingCanonical: hydratedCanonical,
        existingOccurrence: created.occurrence,
        nextSequence: 9,
        now: "2026-01-07T00:00:00Z",
      };

      const decision = decideObservation(revised, state);
      expect(decision.outcome).toEqual({ _tag: "UpdatedCanonical", id: listing.canonicalJobId });
      expect(decision.canonical.employerName).toBe("Bakery Norge AS");
      // The description a real detail fetch supplied survives the sweep —
      // not silently replaced by the feed's own placeholder text.
      expect(decision.canonical.hydration).toEqual({
        _tag: "Hydrated",
        description: "Fetched via Hydration.hydrate.",
      });
    });

    it("a source reopening an already-hydrated, since-closed vacancy keeps its hydration through the reopen", () => {
      const listing = normalize(raw({ hydrated: false }));
      const closedButHydrated: CanonicalJob = {
        id: listing.canonicalJobId,
        title: "Baker",
        employerName: "Bakery AS",
        location: "Oslo",
        applicationUrl: "https://example.com/job/1",
        publishedAt: "2026-01-01T00:00:00Z",
        status: { _tag: "Closed", closedAt: "2026-01-05T00:00:00Z" },
        sequence: 4 as CanonicalJob["sequence"],
        changedAt: "2026-01-05T00:00:00Z",
        sources: ["nav" as SourceId],
        hydration: { _tag: "Hydrated", description: "Fetched before it closed." },
      };
      const existingOccurrence: OccurrenceRecord = {
        id: listing.occurrenceId,
        canonicalJobId: listing.canonicalJobId,
        sourceId: "nav" as SourceId,
        platformId: "arbeidsplassen-nav" as PlatformId,
        externalId: "1",
        contentFingerprint: listing.contentFingerprint,
        active: false,
        firstSeenAt: "2026-01-01T00:00:00Z",
        lastSeenAt: "2026-01-05T00:00:00Z",
      };
      const state: ObservationState = {
        existingCanonical: closedButHydrated,
        existingOccurrence,
        nextSequence: 5,
        now: "2026-01-06T00:00:00Z",
      };

      const decision = decideObservation(listing, state);
      expect(decision.outcome).toEqual({ _tag: "ReopenedCanonical", id: listing.canonicalJobId });
      expect(decision.canonical.hydration).toEqual({
        _tag: "Hydrated",
        description: "Fetched before it closed.",
      });
    });
  });
});
