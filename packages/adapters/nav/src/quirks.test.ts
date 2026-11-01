import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as Result from "effect/Result";
import { deriveWorkload } from "../../../domain/src/observation/Workload.ts";
import { PROVISIONAL_HYDRATION_PER_RUN } from "../../../../apps/worker/src/ingestion/hydrationBudget.ts";
import { closedObservation, detailObservation, feedObservations } from "./observe.ts";
import { NAV_QUIRKS } from "./quirks.ts";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../../fixtures/nav/${name}`, import.meta.url), "utf8"));

/** Every `fixture`-verified quirk, re-checked against the fixture it names. */
const checks: Readonly<Record<string, () => void>> = {
  "NAV-Q1": () => {
    const [active] = Result.getOrThrow(feedObservations(fixture("feed-page.json")));
    for (const attribute of [
      "employmentType",
      "taxID",
      "totalJobOpenings",
      "datePosted",
      "validThrough",
    ] as const) {
      expect(active?.facts[attribute].state).toBe("TempUnknown");
    }
    expect(deriveWorkload(active!).fact.state).toBe("TempUnknown");
  },
  "NAV-Q2": () => {
    const live = Result.getOrThrow(detailObservation(fixture("live-detail.json")));
    expect(live.facts.employmentType.value).toBe("Deltid");
    expect(deriveWorkload(live).fact).toMatchObject({ state: "Unsupported", schedule: "PartTime" });
  },
  "NAV-Q4": () => {
    const raw = fixture("live-detail.json") as { ad_content: { positioncount: unknown } };
    expect(raw.ad_content.positioncount).toBe("3");
    expect(Result.getOrThrow(detailObservation(raw)).facts.totalJobOpenings.value).toBe(3);
  },
  "NAV-Q5": () => {
    const closed = Result.getOrThrow(
      closedObservation({
        uuid: "gone",
        sistEndret: "2026-08-06T07:20:51+02:00",
        status: "INACTIVE",
      }),
    );
    expect(closed.kind).toBe("StatusOnly");
  },
  "NAV-Q6": () => {
    const raw = fixture("live-detail.json") as {
      ad_content: { workLocations: ReadonlyArray<{ city: unknown }> };
    };
    expect(raw.ad_content.workLocations[0]?.city).toBeNull();
    const live = Result.getOrThrow(detailObservation(raw));
    expect(live.residue.some((c) => c.path === "ad_content.workLocations[0].city")).toBe(false);
  },
  "NAV-Q7": () => {
    const live = Result.getOrThrow(detailObservation(fixture("live-detail.json")));
    expect(live.residue.find((c) => c.path === "ad_content.applicationDue")?.value).toBe("Snarest");
  },
  "NAV-Q8": () => {
    const live = fixture("live-detail.json") as { sistEndret: string };
    expect(live.sistEndret).toMatch(/\+02:00$/);
    const feed = fixture("feed-page.json") as { items: ReadonlyArray<{ date_modified: string }> };
    expect(feed.items[0]?.date_modified).toMatch(/Z$/);
  },
};

describe("NAV quirk catalogue (WS-0022 §9)", () => {
  it("ids are unique and every quirk names its evidence", () => {
    expect(new Set(NAV_QUIRKS.map((q) => q.id)).size).toBe(NAV_QUIRKS.length);
    for (const quirk of NAV_QUIRKS) expect(quirk.evidence.length).toBeGreaterThan(0);
  });

  it("every fixture-verified quirk has a check, and only those", () => {
    expect(Object.keys(checks).toSorted()).toEqual(
      NAV_QUIRKS.filter((q) => q.verifiedBy === "fixture")
        .map((q) => q.id)
        .toSorted(),
    );
  });

  it.each(Object.entries(checks))("%s still holds against its fixture", (_id, check) => check());

  it("the bounded-hydration default is labelled provisional and matches the configured default (L4)", () => {
    const quirk = NAV_QUIRKS.find((q) => q.id === "NAV-Q9");
    expect(quirk).toMatchObject({ provisional: true, verifiedBy: "unverified" });
    expect(quirk?.consequence).toContain(`Default ${PROVISIONAL_HYDRATION_PER_RUN} `);
  });
});
