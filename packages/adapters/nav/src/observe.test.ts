import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  ListingObservation,
  ObservationContent,
  observationId,
} from "../../../domain/src/observation/Ir.ts";
import { decodeDetail, decodeFeedPage, summaryListing } from "./decode.ts";
import { closedObservation, detailObservation, feedObservations, lower } from "./observe.ts";

/**
 * WS-0022 §4: the importer emits the IR, and `lower` keeps `RawListing` (and therefore the corpus) unchanged. The
 * reference is the pre-WS-0022 decoder itself (`summaryListing`, `decodeDetail`), which this file runs side by side:
 * equal listings, or the same failure field, for the checked-in fixtures and for generated payloads.
 */

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../../fixtures/nav/${name}`, import.meta.url), "utf8"));

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runSyncExit(effect);

/** Success value, or `{ failedOn: field }`: the shape two decoders must agree on. */
const outcomeOf = <A>(exit: Exit.Exit<A, { readonly field: string }>) =>
  Exit.isSuccess(exit)
    ? { ok: exit.value }
    : {
        failedOn: Exit.findErrorOption(exit).pipe((o) =>
          o._tag === "Some" ? o.value.field : "defect",
        ),
      };

const resultOutcome = <A>(result: Result.Result<A, { readonly field: string }>) =>
  Result.isSuccess(result) ? { ok: result.success } : { failedOn: result.failure.field };

const viaDecoder = (feedJson: unknown) => {
  const page = run(decodeFeedPage(feedJson));
  if (!Exit.isSuccess(page)) throw new Error("fixture feed did not decode");
  return page.value.items.map((item) => outcomeOf(run(summaryListing(item))));
};

const viaLower = (feedJson: unknown) => {
  const observed = feedObservations(feedJson);
  if (!Result.isSuccess(observed)) throw new Error("fixture feed did not import");
  return observed.success.map((content) => resultOutcome(lower(content)));
};

describe("NAV importer: lower(import(x)) equals the pre-WS-0022 decoder", () => {
  it("feed-page.json: every item, ACTIVE and INACTIVE, lowers to summaryListing's answer", () => {
    const feed = fixture("feed-page.json");
    expect(viaLower(feed)).toEqual(viaDecoder(feed));
    expect(viaLower(feed).map((o) => ("ok" in o ? "ok" : o.failedOn))).toEqual(["ok", "status"]);
  });

  it.each([
    "detail-active.json",
    "detail-nonmatching.json",
    "detail-updated.json",
    "live-detail.json",
  ])("%s lowers to decodeDetail's listing", (name) => {
    const json = fixture(name);
    const content = detailObservation(json);
    expect(Result.isSuccess(content)).toBe(true);
    expect(resultOutcome(Result.flatMap(content, lower))).toEqual(
      outcomeOf(run(decodeDetail(json))),
    );
  });

  it("generated feed items: same listing or same failure field as summaryListing", () => {
    const blankable = fc.option(
      fc.oneof(fc.constant(""), fc.constant("  "), fc.string({ maxLength: 12 })),
      {
        nil: null,
      },
    );
    const item = fc.record({
      id: blankable,
      url: blankable,
      title: blankable,
      content_text: blankable,
      date_modified: fc.option(
        fc.constantFrom("2026-08-05T08:00:00Z", "", "2026-08-06T07:20:51+02:00"),
        {
          nil: null,
        },
      ),
      _feed_entry: fc.record({
        uuid: fc.stringMatching(/^[a-z0-9-]{1,12}$/),
        status: fc.constantFrom("ACTIVE", "active", "INACTIVE"),
        title: blankable,
        businessName: blankable,
        municipal: blankable,
        sistEndret: fc.option(fc.constantFrom("2026-08-05T08:00:00Z", ""), { nil: null }),
      }),
    });
    fc.assert(
      fc.property(fc.array(item, { maxLength: 4 }), (items) => {
        const feed = { feed_url: "/api/v1/feed/page-1", items };
        expect(viaLower(feed)).toEqual(viaDecoder(feed));
      }),
    );
  });

  it("generated details: same listing or same failure field as decodeDetail", () => {
    const blankable = fc.option(fc.oneof(fc.constant(""), fc.string({ maxLength: 10 })), {
      nil: null,
    });
    const location = fc.record({ city: blankable, municipal: blankable, county: blankable });
    const detail = fc.record({
      uuid: fc.stringMatching(/^[a-z0-9-]{1,12}$/),
      status: fc.constantFrom("ACTIVE", "INACTIVE"),
      sistEndret: fc.option(fc.constant("2026-08-05T08:00:00Z"), { nil: null }),
      ad_content: fc.record({
        title: blankable,
        jobtitle: blankable,
        published: fc.option(fc.constantFrom("2026-08-05T07:45:00Z", ""), { nil: null }),
        updated: fc.option(fc.constantFrom("2026-08-05T08:00:00Z", ""), { nil: null }),
        expires: fc.option(fc.constantFrom("2026-08-25T23:59:59Z", "Snarest", ""), { nil: null }),
        applicationDue: fc.option(fc.constantFrom("2026-08-20", "Snarest", ""), { nil: null }),
        description: fc.option(fc.constantFrom("<p>50 % stilling</p>", "", "<p> </p>"), {
          nil: null,
        }),
        applicationUrl: blankable,
        link: blankable,
        sourceurl: blankable,
        extent: fc.option(fc.constantFrom("Heltid", "Deltid", ""), { nil: null }),
        positioncount: fc.option(fc.constantFrom("3", "0", "x", 2), { nil: null }),
        workLocations: fc.array(location, { maxLength: 3 }),
        employer: fc.record({ name: blankable, orgnr: blankable }),
      }),
    });
    fc.assert(
      fc.property(detail, (json) => {
        const content = detailObservation(json);
        expect(Result.isSuccess(content)).toBe(true);
        expect(resultOutcome(Result.flatMap(content, lower))).toEqual(
          outcomeOf(run(decodeDetail(json))),
        );
      }),
    );
  });
});

describe("NAV importer: the new facts", () => {
  it("the recorded live detail carries extent, orgnr and positioncount as facts; nothing is dropped into thin air", () => {
    const json = fixture("live-detail.json");
    const content = Result.getOrThrow(detailObservation(json));
    expect(content.facts.employmentType).toMatchObject({ state: "Stated", value: "Deltid" });
    expect(content.facts.taxID).toMatchObject({ state: "Stated", value: "920912613" });
    expect(content.facts.totalJobOpenings).toMatchObject({ state: "Stated", value: 3 });
    // Unmapped content is uniform residue, e.g. `occupationCategories`, `engagementtype` and `starttime`.
    const paths = content.residue.map((claim) => claim.path);
    expect(paths).toContain("ad_content.engagementtype");
    expect(paths).toContain("ad_content.starttime");
    expect(paths.some((path) => path.startsWith("ad_content.occupationCategories"))).toBe(true);
    expect(paths).not.toContain("ad_content.extent");
  });

  it("a feed summary carries the workload attributes as TempUnknown, never as a value", () => {
    const [active] = Result.getOrThrow(feedObservations(fixture("feed-page.json")));
    expect(active?.facts.employmentType.state).toBe("TempUnknown");
    expect(active?.facts.taxID.state).toBe("TempUnknown");
    expect(active?.facts.totalJobOpenings.state).toBe("TempUnknown");
  });

  it("NAV's status-only answer for a closed advert is an observation with no listing", () => {
    const closed = Result.getOrThrow(
      closedObservation({
        uuid: "gone",
        sistEndret: "2026-08-06T07:20:51+02:00",
        status: "INACTIVE",
      }),
    );
    expect(closed).toMatchObject({ kind: "StatusOnly", status: "INACTIVE", externalId: "gone" });
    expect(Result.isFailure(lower(closed))).toBe(true);
  });

  it("every emitted observation decodes as IR v0 and round-trips with a stable content address", () => {
    const contents = [
      ...Result.getOrThrow(feedObservations(fixture("feed-page.json"))),
      Result.getOrThrow(detailObservation(fixture("live-detail.json"))),
      Result.getOrThrow(detailObservation(fixture("detail-active.json"))),
    ];
    for (const content of contents) {
      const encoded = Schema.encodeSync(ObservationContent)(content);
      const decoded = Schema.decodeUnknownSync(ObservationContent)(
        JSON.parse(JSON.stringify(encoded)),
      );
      expect(decoded).toEqual(content);
      expect(observationId(decoded)).toBe(observationId(content));
      expect(
        Schema.is(ListingObservation)({
          id: observationId(content),
          content,
          recorded: { recordedSeq: 1, recordedAt: "2026-11-01T00:00:00Z", runId: "r" },
        }),
      ).toBe(true);
    }
  });
});
