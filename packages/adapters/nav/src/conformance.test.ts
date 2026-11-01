import { readFileSync } from "node:fs";
import * as Result from "effect/Result";
import type { ObservationContent } from "../../../domain/src/observation/Ir.ts";
import { defineSourceConformance } from "../../src/Conformance.ts";
import type { BrokenTwin, Payload, SourceImporter } from "../../src/Conformance.ts";
import { closedObservation, detailObservation, feedObservations } from "./observe.ts";

/** NAV is the first subject of the shared conformance suite (WS-0022 §7), over the checked-in fixtures only. */

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../../fixtures/nav/${name}`, import.meta.url), "utf8"));

const nav: SourceImporter = {
  source: "nav",
  importPayload: (payload) => {
    switch (payload.kind) {
      case "feed":
        return feedObservations(payload.json);
      case "detail":
        return Result.map(detailObservation(payload.json), (o) => [o]);
      case "closed":
        return Result.map(closedObservation(payload.json), (o) => [o]);
    }
  },
};

const feed: Payload = { kind: "feed", json: fixture("feed-page.json") };
const detailActive: Payload = { kind: "detail", json: fixture("detail-active.json") };
const liveDetail: Payload = { kind: "detail", json: fixture("live-detail.json") };
const closed: Payload = {
  kind: "closed",
  json: { uuid: "gone", sistEndret: "2026-08-06T07:20:51+02:00", status: "INACTIVE" },
};

const mapEach =
  (
    f: (o: ObservationContent) => ReadonlyArray<ObservationContent>,
  ): SourceImporter["importPayload"] =>
  (payload) =>
    Result.map(nav.importPayload(payload), (os) => os.flatMap(f));

let receipt = 0;

const twins: ReadonlyArray<BrokenTwin> = [
  {
    id: "N1",
    breaks: "G1",
    describe: "a receipt counter is part of the content",
    importer: {
      source: "nav (broken N1)",
      importPayload: mapEach((o) => {
        receipt += 1;
        return [{ ...o, residue: [...o.residue, { path: "_received", value: String(receipt) }] }];
      }),
    },
  },
  {
    id: "N2",
    breaks: "G2",
    describe: "INACTIVE entries are filtered, as the pre-WS-0022 adapter page did",
    importer: {
      source: "nav (broken N2)",
      importPayload: mapEach((o) => (o.status === "ACTIVE" ? [o] : [])),
    },
  },
  {
    id: "N3",
    breaks: "G3",
    describe: "a missing extent is filled in as Heltid (missing treated as full-time)",
    importer: {
      source: "nav (broken N3)",
      importPayload: mapEach((o) =>
        o.facts.employmentType.value === undefined
          ? [
              {
                ...o,
                kind: "Detail",
                facts: {
                  ...o.facts,
                  employmentType: {
                    state: "Stated",
                    value: "Heltid",
                    evidence: ["default"],
                    method: "nav-import@0",
                  },
                },
              },
            ]
          : [o],
      ),
    },
  },
  {
    id: "N4",
    breaks: "G4",
    describe: "the description fact loses its evidence",
    importer: {
      source: "nav (broken N4)",
      importPayload: mapEach((o) => [
        { ...o, facts: { ...o.facts, description: { ...o.facts.description, evidence: [] } } },
      ]),
    },
  },
];

defineSourceConformance(
  nav,
  {
    payloads: [feed, detailActive, liveDetail, closed],
    closure: { payload: feed, externalId: "inactive-vacancy-2" },
    noWorkload: [feed, detailActive, closed],
  },
  twins,
);
