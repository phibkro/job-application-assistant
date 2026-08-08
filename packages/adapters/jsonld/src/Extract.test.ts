import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type { PlatformId, SourceId } from "../../../domain/src/Ids.ts";
import { extractJobPostings } from "./Extract.ts";

const context = {
  sourceId: "career-site" as SourceId,
  sourceName: "Career Site",
  platformId: "career-site" as PlatformId,
  pageUrl: "https://careers.example/openings/backend-engineer",
};

const page = (ldJson: string): string =>
  `<html><head><title>Backend Engineer</title>
    <script type="application/ld+json">${ldJson}</script>
  </head><body><h1>Backend Engineer</h1></body></html>`;

describe("extractJobPostings", () => {
  it("extracts a bare JobPosting object", async () => {
    const html = page(
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "JobPosting",
        title: "Backend Engineer",
        description: "Build things.",
        datePosted: "2026-08-01",
        hiringOrganization: { name: "Example AS" },
      }),
    );

    const listings = await Effect.runPromise(extractJobPostings(html, context));

    expect(listings).toHaveLength(1);
    expect(listings[0]?.title).toBe("Backend Engineer");
    expect(listings[0]?.employerName).toBe("Example AS");
  });

  it("extracts JobPosting entries out of an array mixed with unrelated node types", async () => {
    const html = page(
      JSON.stringify([
        { "@type": "Organization", name: "Example AS" },
        { "@type": "JobPosting", title: "Backend Engineer", datePosted: "2026-08-01" },
        { "@type": "JobPosting", title: "Frontend Engineer", datePosted: "2026-08-02" },
      ]),
    );

    const listings = await Effect.runPromise(extractJobPostings(html, context));

    expect(listings.map((listing) => listing.title).toSorted()).toEqual([
      "Backend Engineer",
      "Frontend Engineer",
    ]);
  });

  it("extracts JobPosting entries nested under @graph", async () => {
    const html = page(
      JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "WebSite", name: "Careers" },
          { "@type": "JobPosting", title: "Backend Engineer", datePosted: "2026-08-01" },
        ],
      }),
    );

    const listings = await Effect.runPromise(extractJobPostings(html, context));

    expect(listings).toHaveLength(1);
    expect(listings[0]?.title).toBe("Backend Engineer");
  });

  it("strips HTML and decodes entities from the description", async () => {
    const html = page(
      JSON.stringify({
        "@type": "JobPosting",
        title: "Backend Engineer",
        datePosted: "2026-08-01",
        description: "<p>Build things &amp; ship them.</p><ul><li>Own a service</li></ul>",
      }),
    );

    const listings = await Effect.runPromise(extractJobPostings(html, context));

    expect(listings[0]?.description).toBe("Build things & ship them. Own a service");
  });

  it("returns an empty list, not an error, for a page with no JobPosting", async () => {
    const html = page(JSON.stringify({ "@type": "Organization", name: "Example AS" }));

    const listings = await Effect.runPromise(extractJobPostings(html, context));

    expect(listings).toEqual([]);
  });

  it("skips a malformed ld+json block instead of failing the whole page", async () => {
    const html =
      page(
        JSON.stringify({
          "@type": "JobPosting",
          title: "Backend Engineer",
          datePosted: "2026-08-01",
        }),
      ) + '<script type="application/ld+json">{ not valid json </script>';

    const listings = await Effect.runPromise(extractJobPostings(html, context));

    expect(listings).toHaveLength(1);
  });

  it("fails loudly when a node tagged JobPosting does not actually match the shape", async () => {
    const html = page(
      JSON.stringify({ "@type": "JobPosting", title: 12345, datePosted: "2026-08-01" }),
    );

    const exit = await Effect.runPromiseExit(extractJobPostings(html, context));

    expect(exit._tag).toBe("Failure");
  });
});
