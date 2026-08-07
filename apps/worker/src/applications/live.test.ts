import { describe, expect, it } from "vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { DeliveryPlatform } from "@job-index/domain/Delivery";
import { Subscription } from "@job-index/domain/Subscription";
import { PlatformPolicyRecord, SavedJob } from "@job-index/domain/Applications";
import type { PolicyTag } from "@job-index/domain/Applications";
import type { RawListing } from "@job-index/domain/Job";
import type {
  CanonicalJobId,
  DeliveryPlatformId,
  PlatformId,
  ProfileId,
  SavedJobId,
  SourceId,
} from "@job-index/domain/Ids";
import { layerSqlite } from "../db/Sqlite.ts";
import * as DeliveryPlatforms from "../db/repositories/DeliveryPlatforms.ts";
import * as SubscriptionsRepo from "../db/repositories/Subscriptions.ts";
import { Database } from "../services/Database.ts";
import { Corpus } from "../services/Corpus.ts";
import { Profiles } from "../services/Accounts.ts";
import { Applications } from "../services/Applications.ts";
import type { Entitlements } from "../services/Entitlements.ts";
import { Policy } from "../services/Policy.ts";
import { layer as corpusLayer, normalize } from "../corpus/index.ts";
import { layer as draftingLayer } from "../drafting/index.ts";
import { layer as applicationsIndexLayer } from "./index.ts";
import * as SavedJobs from "./savedJobs.ts";
import * as PlatformPolicies from "./platformPolicies.ts";

/**
 * `Applications`, `Entitlements`, and `Policy` against a real SQL engine
 * running the generated schema — the same reason `corpus/live.test.ts`
 * exists: every other test in this slot runs on plain objects and can prove
 * nothing about the SQL this shell actually sends.
 *
 * `Profiles` is stubbed rather than provided by `accounts/index.ts`. That is
 * not a shortcut: `accounts/profileRow.ts` writes `profiles` with columns
 * (`headline`, `summary`, ...) the generated table does not have — it
 * predates `packages/domain/src/Profile.ts` gaining a `Model.Class`, and
 * `accounts`'s own tests run on a hand-rolled fake that cannot see this. A
 * probe here (`Profiles.set` against `layerSqlite()`) reproduces the failure
 * directly: SQLite dies on the write. See the report. Proving `Applications`
 * against a real engine does not require re-proving `accounts`'s own
 * persistence, which this slot does not own and cannot fix from here — so
 * `Profiles` is provided as a fixed, in-memory value instead, and everything
 * this slot actually persists (`saved_jobs`, `applications`,
 * `platform_policies`, plus its reads of `subscriptions` and
 * `delivery_platforms`) runs for real.
 */
const stubProfile = {
  headline: "Baker",
  summary: "Bakes bread for a living.",
  location: "Oslo",
  languages: "Norwegian, English",
  skills: ["baking"],
  experience: [{ title: "Baker", employer: "Bakery AS", period: "2020-2026", highlights: [] }],
  education: [],
};
const profilesStub = Layer.succeed(Profiles, {
  get: () => Effect.succeed(stubProfile),
  set: () => Effect.succeed(stubProfile),
  answers: () => Effect.succeed([]),
  answer: () => Effect.void,
  unanswered: () => Effect.succeed([]),
});

const dataLayer = Layer.mergeAll(corpusLayer, draftingLayer, profilesStub).pipe(
  Layer.provideMerge(layerSqlite()),
);

const fullLayer = applicationsIndexLayer.pipe(Layer.provideMerge(dataLayer));

/**
 * `E` stays generic, converted to a defect via `orDie` rather than
 * constrained to `never`: most scenarios here expect `prepare` to succeed,
 * and its declared error union should surface as a loud test failure if it
 * does not, not a type error at the call site.
 */
const run = <A, E>(
  effect: Effect.Effect<A, E, Applications | Entitlements | Policy | Corpus | Database>,
): Promise<A> => Effect.runPromise(Effect.orDie(Effect.provide(effect, fullLayer)));

/** For the cases where the failure IS the assertion. */
const runExit = <A, E>(
  effect: Effect.Effect<A, E, Applications | Entitlements | Policy | Corpus | Database>,
): Promise<Exit.Exit<A, E>> => Effect.runPromise(Effect.exit(Effect.provide(effect, fullLayer)));

const raw = (overrides: Partial<RawListing> = {}): RawListing => ({
  sourceId: "nav" as SourceId,
  sourceName: "NAV",
  externalId: "1",
  title: "Baker",
  employerName: "Bakery AS",
  location: "Oslo",
  description: "Bakes bread.",
  applicationUrl: "https://jobs.webcruiter.no/vacancy/1",
  publishedAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

const PROFILE = "profile-1" as ProfileId;
const PLATFORM = "webcruiter" as PlatformId;

/** Seeds one canonical job, one bookmark of it, and returns both ids. */
const seedSavedJob = (profile: ProfileId, listingOverrides: Partial<RawListing> = {}) =>
  Effect.gen(function* () {
    const corpus = yield* Corpus;
    const listing = normalize(raw(listingOverrides));
    yield* corpus.observe(listing);
    const now = yield* DateTime.now;
    const savedJobId = crypto.randomUUID() as SavedJobId;
    yield* SavedJobs.insert(
      new SavedJob({
        id: savedJobId,
        profileId: profile,
        canonicalJobId: listing.canonicalJobId,
        note: "",
        createdAt: now,
      }),
    );
    return { savedJobId, canonicalJobId: listing.canonicalJobId as CanonicalJobId };
  });

const seedDeliveryPlatform = (hostPattern: string) =>
  Effect.gen(function* () {
    const now = yield* DateTime.now;
    yield* DeliveryPlatforms.insert(
      new DeliveryPlatform({
        // A different id space from `PlatformId` (see `Registry.ts`); the
        // two happen to share this test's literal string, nothing more.
        id: PLATFORM as unknown as DeliveryPlatformId,
        name: "Webcruiter",
        hostPattern,
        tier: { _tag: "Unknown" },
        mappings: [],
        automationProhibited: false,
        learnedAt: Option.none(),
        createdAt: now,
        updatedAt: now,
      }),
    );
  });

const seedPolicy = (policy: PolicyTag) =>
  Effect.gen(function* () {
    const now = yield* DateTime.now;
    yield* PlatformPolicies.upsert(
      new PlatformPolicyRecord({ platformId: PLATFORM, policy, updatedAt: now }),
    );
  });

const seedSubscription = (tier: Subscription["tier"]) =>
  Effect.gen(function* () {
    const now = yield* DateTime.now;
    yield* SubscriptionsRepo.upsert(
      new Subscription({
        profileId: PROFILE,
        tier,
        providerRef: "",
        provider: "none",
        updatedAt: now,
      }),
    );
  });

describe("Applications against a real SQLite engine", () => {
  it("prepares an automated application for real when entitled and the platform allows it", async () => {
    const prepared = await run(
      Effect.gen(function* () {
        yield* seedDeliveryPlatform("webcruiter.no");
        yield* seedPolicy("Allowed");
        yield* seedSubscription({ _tag: "Premium", until: "2099-01-01" });
        const { savedJobId } = yield* seedSavedJob(PROFILE);
        const applications = yield* Applications;
        return yield* applications.prepare(PROFILE, savedJobId, "automated");
      }),
    );
    expect(prepared.method).toBe("automated");
    expect(prepared.downgradeReason).toBeUndefined();
    expect(prepared.documents.cv).toContain("Baker");
  });

  it("downgrades to assisted — a success, not a failure — when the platform is only reviewed for assistance", async () => {
    const prepared = await run(
      Effect.gen(function* () {
        yield* seedDeliveryPlatform("webcruiter.no");
        yield* seedPolicy("AssistedOnly");
        yield* seedSubscription({ _tag: "Premium", until: "2099-01-01" });
        const { savedJobId } = yield* seedSavedJob(PROFILE);
        const applications = yield* Applications;
        return yield* applications.prepare(PROFILE, savedJobId, "automated");
      }),
    );
    expect(prepared.method).toBe("assisted");
    expect(prepared.downgradeReason).toBe(`${PLATFORM}: AssistedOnly`);
  });

  it("an unreviewed platform (no delivery_platforms row at all) never automates, however the account pays", async () => {
    const prepared = await run(
      Effect.gen(function* () {
        // No `seedDeliveryPlatform`/`seedPolicy` call: the URL matches nothing.
        yield* seedSubscription({ _tag: "Premium", until: "2099-01-01" });
        const { savedJobId } = yield* seedSavedJob(PROFILE, {
          applicationUrl: "https://unknown.example/x",
        });
        const applications = yield* Applications;
        return yield* applications.prepare(PROFILE, savedJobId, "automated");
      }),
    );
    expect(prepared.method).toBe("assisted");
    expect(prepared.downgradeReason).toContain("Unreviewed");
  });

  it("a free account cannot automate an allowed platform — the entitlement gate, not the policy gate", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        Effect.gen(function* () {
          yield* seedDeliveryPlatform("webcruiter.no");
          yield* seedPolicy("Allowed");
          // No `seedSubscription`: no row at all means Free.
          const { savedJobId } = yield* seedSavedJob(PROFILE);
          const applications = yield* Applications;
          return yield* applications.prepare(PROFILE, savedJobId, "automated");
        }),
        fullLayer,
      ),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(String(exit.cause)).toContain("EntitlementRequired");
    }
  });

  it("a prohibited platform blocks outright, even a paying account, even an assisted request", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        Effect.gen(function* () {
          yield* seedDeliveryPlatform("webcruiter.no");
          yield* seedPolicy("Prohibited");
          yield* seedSubscription({ _tag: "Premium", until: "2099-01-01" });
          const { savedJobId } = yield* seedSavedJob(PROFILE);
          const applications = yield* Applications;
          return yield* applications.prepare(PROFILE, savedJobId, "assisted");
        }),
        fullLayer,
      ),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(String(exit.cause)).toContain("PolicyProhibited");
    }
  });

  it("an unknown savedJob id fails DraftMissing rather than dying", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        Effect.gen(function* () {
          const applications = yield* Applications;
          return yield* applications.prepare(PROFILE, "nope" as SavedJobId, "assisted");
        }),
        fullLayer,
      ),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(String(exit.cause)).toContain("DraftMissing");
    }
  });

  it("setStatus moves the persisted row, and re-preparing never sees it (it is a fresh application)", async () => {
    const { application, statusRows } = await run(
      Effect.gen(function* () {
        yield* seedDeliveryPlatform("webcruiter.no");
        yield* seedPolicy("Allowed");
        yield* seedSubscription({ _tag: "Premium", until: "2099-01-01" });
        const { savedJobId } = yield* seedSavedJob(PROFILE);
        const applications = yield* Applications;
        const prepared = yield* applications.prepare(PROFILE, savedJobId, "assisted");
        yield* applications.setStatus(
          PROFILE,
          prepared.application,
          "interview",
          "Phone screen booked.",
        );
        const db = yield* Database;
        const rows = yield* db.query<{ status: string; notes: string }>(
          "SELECT status, notes FROM applications WHERE id = ?",
          [prepared.application],
        );
        return { application: prepared.application, statusRows: rows };
      }),
    );
    expect(statusRows).toEqual([{ status: "interview", notes: "Phone screen booked." }]);
    expect(application).toBeTruthy();
  });

  it("setStatus on an unknown application id fails, rather than reporting a decision it never recorded", async () => {
    const exit = await runExit(
      Effect.gen(function* () {
        const applications = yield* Applications;
        yield* applications.setStatus(PROFILE, "nope" as never, "withdrawn", "");
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("setStatus never lets one profile move another profile's application", async () => {
    const rows = await run(
      Effect.gen(function* () {
        yield* seedDeliveryPlatform("webcruiter.no");
        yield* seedPolicy("Allowed");
        yield* seedSubscription({ _tag: "Premium", until: "2099-01-01" });
        const { savedJobId } = yield* seedSavedJob(PROFILE);
        const applications = yield* Applications;
        const prepared = yield* applications.prepare(PROFILE, savedJobId, "assisted");
        // Refused, and refused the same way an unknown id is: a caller must not
        // be able to learn that someone else's application exists.
        yield* Effect.exit(
          applications.setStatus(
            "someone-else" as ProfileId,
            prepared.application,
            "withdrawn",
            "not yours",
          ),
        );
        const db = yield* Database;
        return yield* db.query<{ status: string }>("SELECT status FROM applications WHERE id = ?", [
          prepared.application,
        ]);
      }),
    );
    expect(rows).toEqual([{ status: "ready" }]);
  });

  it("a real CHECK constraint rejects a status value the domain schema does not know — proof this runs against the actual schema, not a fake", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        Effect.gen(function* () {
          const db = yield* Database;
          yield* db.run(
            `INSERT INTO applications (id, profileId, savedJobId, canonicalJobId, method, status, applicationUrl, cv, letter, generator, downgradeReason, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              "a1",
              "p1",
              "s1",
              "c1",
              "assisted",
              "not-a-real-status",
              "url",
              "cv",
              "letter",
              "template",
              null,
              "",
              "now",
              "now",
            ],
          );
        }),
        dataLayer,
      ),
    );
    expect(exit._tag).toBe("Failure");
  });

  it("Policy.forJob on a canonical job id nothing observed yet resolves to Unreviewed, not a crash", async () => {
    const result = await run(
      Effect.gen(function* () {
        const policy = yield* Policy;
        return yield* policy.forJob("no-such-job" as never);
      }),
    );
    expect(result).toEqual({ platform: "", policy: { _tag: "Unreviewed" } });
  });

  it("Policy.requireAutomatable fails PolicyProhibited for a downgrade-worthy policy too, not only Prohibited", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.provide(
        Effect.gen(function* () {
          yield* seedDeliveryPlatform("webcruiter.no");
          yield* seedPolicy("AssistedOnly");
          const { canonicalJobId } = yield* seedSavedJob(PROFILE);
          const policy = yield* Policy;
          return yield* policy.requireAutomatable(canonicalJobId);
        }),
        fullLayer,
      ),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(String(exit.cause)).toContain("PolicyProhibited");
    }
  });

  it("Policy.requireAutomatable succeeds for an Allowed platform", async () => {
    await run(
      Effect.gen(function* () {
        yield* seedDeliveryPlatform("webcruiter.no");
        yield* seedPolicy("Allowed");
        const { canonicalJobId } = yield* seedSavedJob(PROFILE);
        const policy = yield* Policy;
        yield* policy.requireAutomatable(canonicalJobId);
      }),
    );
  });
});
