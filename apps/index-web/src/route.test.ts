import fc from "fast-check";
import { Option } from "effect";
import { describe, expect, test } from "vitest";
import { urlOrThrow } from "./main.fixture.ts";
import { AppRoute, type JobsQuery, jobRouter, jobsRouter, urlToAppRoute } from "./route.ts";

/**
 * The query-sync law (WS-0025 acceptance): printing a filter state into a URL
 * and parsing that URL back gives the same state, parse(print(q)) = q. The
 * generator covers well-formed Unicode text including the characters URL
 * encoding is most likely to mangle (`&`, `=`, `+`, `%`, `#`, `?`, `/`,
 * spaces), absent filters, and empty strings.
 */
const ORIGIN = "http://localhost";

const tricky = fc.constantFrom("&", "=", "+", "%", "%20", "#", "?", "/", " ", "ø", "Å", "😀");
const filterText = fc.oneof(
  fc.string({ unit: "grapheme" }),
  fc
    .array(fc.oneof(tricky, fc.string({ unit: "grapheme", maxLength: 3 })))
    .map((parts) => parts.join("")),
);
const maybeFilter = fc.option(filterText, { nil: undefined }).map(Option.fromNullishOr);
const jobsQuery: fc.Arbitrary<JobsQuery> = fc.record({ term: maybeFilter, location: maybeFilter });

const parse = (path: string) => urlToAppRoute(urlOrThrow(`${ORIGIN}${path}`));

describe("URL ↔ query round-trip", () => {
  test("parse(print(q)) = q for every filter state", () => {
    fc.assert(
      fc.property(jobsQuery, (query) => {
        expect(parse(jobsRouter(query))).toStrictEqual(AppRoute.Jobs(query));
      }),
      { numRuns: 1000 },
    );
  });

  /**
   * Scoped to the alphabet the corpus mints (`cj_` + an FNV-1a hex digest,
   * `corpus/identity.ts`), widened to every URL-unreserved character. Wider
   * ids do not round-trip: see the characterization test below.
   */
  test("parse(print(id)) = id for every id in the URL-unreserved alphabet", () => {
    const unreserved = fc.constantFrom(
      ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~",
    );
    fc.assert(
      // "." and ".." are dot segments the URL parser resolves away (RFC 3986 §5.2.4).
      fc.property(
        fc.string({ unit: unreserved, minLength: 1 }).filter((id) => id !== "." && id !== ".."),
        (jobId) => {
          expect(parse(jobRouter({ jobId }))).toStrictEqual(AppRoute.Job({ jobId }));
        },
      ),
      { numRuns: 1000 },
    );
  });

  /**
   * Characterization, not a wish: Foldkit 0.170's `string` path segment
   * neither percent-encodes when printing nor decodes when parsing, so a
   * reserved or non-ASCII character does not survive. Harmless for corpus ids
   * (unreserved by construction); if Foldkit starts encoding, this fails and
   * the law above can widen.
   */
  test("Foldkit 0.170 path segments do not round-trip reserved or non-ASCII characters", () => {
    expect(parse(jobRouter({ jobId: "a b" }))).toStrictEqual(AppRoute.Job({ jobId: "a%20b" }));
    expect(parse(jobRouter({ jobId: "a?b" }))).toStrictEqual(AppRoute.Job({ jobId: "a" }));
    expect(parse(jobRouter({ jobId: "a/b" }))._tag).toBe("NotFound");
    expect(parse(jobRouter({ jobId: "." }))._tag).toBe("NotFound");
  });

  test("the unfiltered list prints as the bare root", () => {
    expect(jobsRouter({ term: Option.none(), location: Option.none() })).toBe("/");
  });
});
