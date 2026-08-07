import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ProfileId } from "@job-index/domain/Ids";
import type { Profile } from "@job-index/domain/Profile";
import { Database } from "../services/Database.ts";
import {
  readProfileRow,
  toDomainErasure,
  toDomainProfile,
  writeErasureRequested,
  writeProfile,
} from "./profileRow.ts";
import { emptyState, fakeDatabaseLayer, type FakeState } from "./fixtures.ts";

const profileId = Schema.decodeUnknownSync(ProfileId)("profile-1");

const run = <A>(state: FakeState, effect: Effect.Effect<A, never, Database>) =>
  Effect.runPromise(effect.pipe(Effect.provide(fakeDatabaseLayer(state))));

const withDb = <A>(f: (db: Database["Service"]) => Effect.Effect<A>) =>
  Effect.gen(function* () {
    const db = yield* Database;
    return yield* f(db);
  });

const sample: Profile = {
  headline: "Support engineer",
  summary: "Five years in customer support.",
  location: "Oslo",
  languages: "Norwegian, English",
  skills: ["Zendesk", "SQL"],
  experience: [
    {
      title: "Support engineer",
      employer: "Acme",
      period: "2021-2026",
      highlights: ["Cut backlog by 40%"],
    },
  ],
  education: ["BSc Computer Science"],
};

describe("writeProfile / readProfileRow", () => {
  it("round-trips a CV through insert", async () => {
    const state = emptyState();
    await run(
      state,
      withDb((db) => writeProfile(db, profileId, sample, "2026-01-01T00:00:00.000Z")),
    );

    const row = await run(
      state,
      withDb((db) => readProfileRow(db, profileId)),
    );
    expect(row).toBeDefined();
    expect(toDomainProfile(row!)).toEqual(sample);
  });

  it("round-trips a CV through update, preserving the row's erasure state", async () => {
    const state = emptyState();
    await run(
      state,
      withDb((db) => writeProfile(db, profileId, sample, "2026-01-01T00:00:00.000Z")),
    );
    await run(
      state,
      withDb((db) =>
        writeErasureRequested(
          db,
          profileId,
          "2026-01-02T00:00:00.000Z",
          "2026-02-01T00:00:00.000Z",
          "2026-01-02T00:00:00.000Z",
        ),
      ),
    );

    const updated: Profile = { ...sample, headline: "Senior support engineer" };
    await run(
      state,
      withDb((db) => writeProfile(db, profileId, updated, "2026-01-03T00:00:00.000Z")),
    );

    const row = await run(
      state,
      withDb((db) => readProfileRow(db, profileId)),
    );
    expect(toDomainProfile(row!)).toEqual(updated);
    expect(toDomainErasure(row)._tag).toBe("Requested");
  });
});

describe("toDomainErasure", () => {
  it("defaults to Active when there is no row yet", () => {
    expect(toDomainErasure(undefined)).toEqual({ _tag: "Active" });
  });

  it("rejects a corrupted erasure column rather than silently granting access", async () => {
    const state = emptyState();
    state.profiles.push({
      profileId,
      headline: "",
      summary: "",
      location: "",
      languages: "",
      skills: "[]",
      experience: "[]",
      education: "[]",
      erasure: JSON.stringify({ _tag: "NotARealTag" }),
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const row = await run(
      state,
      withDb((db) => readProfileRow(db, profileId)),
    );
    expect(() => toDomainErasure(row)).toThrow();
  });
});
