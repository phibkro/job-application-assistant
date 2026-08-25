import { describe, expect, it } from "vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Proposal } from "@job-index/domain/Proposals";
import { ProfileId, ProposalId } from "@job-index/domain/Ids";
import type { Profile } from "@job-index/domain/Profile";
import { Profiles } from "../../services/Accounts.ts";
import { Database } from "../../services/Database.ts";
import { runTest } from "../TestLayer.ts";
import {
  profileWriteForPendingProposal,
  readProfileRow,
  toDomainProfile,
} from "../../accounts/profileRow.ts";
import { acceptProposal, layer as profilesLayer } from "../../accounts/profiles.ts";
import * as Proposals from "./Proposals.ts";

const decodeProfileId = Schema.decodeUnknownSync(ProfileId);
const decodeProposalId = Schema.decodeUnknownSync(ProposalId);
const profileId = decodeProfileId("profile-atomic");
const otherProfileId = decodeProfileId("profile-foreign");
const decidedAt = "2026-08-25T03:00:00.001Z";
const createdAt = DateTime.makeUnsafe("2026-08-25T02:00:00.000Z");

const blank: Profile = {
  headline: "",
  summary: "",
  location: "",
  languages: "",
  skills: [],
  experience: [],
  education: [],
};

const proposal = (
  id: string,
  fieldPath: string,
  proposedValue: unknown,
  owner = profileId,
): Proposal =>
  new Proposal({
    id: decodeProposalId(id),
    profileId: owner,
    sourceKind: "text",
    fieldPath,
    proposedValue,
    evidenceExcerpt: String(proposedValue),
    confidence: "high",
    engine: "heuristic",
    status: "pending",
    createdAt,
    decidedAt: Option.none(),
  });

const run = <A>(effect: Effect.Effect<A, never, Profiles | Database>): Promise<A> =>
  runTest(Effect.provide(effect, profilesLayer));

describe("profile-first atomic proposal acceptance", () => {
  it("creates a missing profile and returns exactly the immediately persisted profile/version", async () => {
    const result = await run(
      Effect.gen(function* () {
        const database = yield* Database;
        const profiles = yield* Profiles;
        const id = decodeProposalId("proposal-missing-profile");
        yield* Proposals.insert(proposal(id, "skills.0", "TypeScript"));

        const accepted = yield* acceptProposal(database, profileId, id, decidedAt, (current) => ({
          ...current,
          skills: [...current.skills, "TypeScript"],
        }));
        const immediate = yield* profiles.getVersioned(profileId);
        const storedProposal = yield* Proposals.findByIdForProfile(id, profileId);
        return { accepted, immediate, storedProposal };
      }),
    );

    expect(result.accepted).toEqual(result.immediate);
    expect(result.accepted?.profile.skills).toEqual(["TypeScript"]);
    expect(result.accepted?.profileUpdatedAt).not.toBeNull();
    expect(result.storedProposal?.status).toBe("accepted");
  });

  it("lets only the first same-id accept merge", async () => {
    const result = await run(
      Effect.gen(function* () {
        const database = yield* Database;
        const profiles = yield* Profiles;
        const id = decodeProposalId("proposal-same-id");
        yield* Proposals.insert(proposal(id, "skills.0", "TypeScript"));

        const first = yield* acceptProposal(database, profileId, id, decidedAt, (current) => ({
          ...current,
          skills: [...current.skills, "TypeScript"],
        }));
        const second = yield* acceptProposal(
          database,
          profileId,
          id,
          "2026-08-25T03:00:00.002Z",
          (current) => ({ ...current, skills: [...current.skills, "TypeScript"] }),
        );
        return {
          first,
          second,
          profile: yield* profiles.getVersioned(profileId),
          storedProposal: yield* Proposals.findByIdForProfile(id, profileId),
        };
      }),
    );

    expect(result.first).toBeDefined();
    expect(result.second).toBeUndefined();
    expect(result.profile.profile.skills).toEqual(["TypeScript"]);
    expect(result.storedProposal?.status).toBe("accepted");
  });

  it("turns a stale second proposal snapshot into [0,0], then retries without losing the first", async () => {
    const result = await run(
      Effect.gen(function* () {
        const database = yield* Database;
        const profiles = yield* Profiles;
        yield* profiles.setVersioned(profileId, blank, null).pipe(Effect.orDie);
        const firstId = decodeProposalId("proposal-distinct-a");
        const secondId = decodeProposalId("proposal-distinct-b");
        yield* Proposals.insert(proposal(firstId, "skills.0", "TypeScript"));
        yield* Proposals.insert(proposal(secondId, "skills.1", "SQLite"));

        const observed = yield* readProfileRow(database, profileId);
        if (observed === undefined) return yield* Effect.die("missing seeded profile");
        const current = toDomainProfile(observed);
        const firstWrite = profileWriteForPendingProposal(
          profileId,
          { ...current, skills: [...current.skills, "TypeScript"] },
          firstId,
          observed,
          decidedAt,
        );
        const staleSecondWrite = profileWriteForPendingProposal(
          profileId,
          { ...current, skills: [...current.skills, "SQLite"] },
          secondId,
          observed,
          decidedAt,
        );

        const firstVector = yield* database.atomicAffected([
          firstWrite.write,
          Proposals.markAcceptedAfterProfileWrite(firstId, profileId, decidedAt),
        ]);
        const staleVector = yield* database.atomicAffected([
          staleSecondWrite.write,
          Proposals.markAcceptedAfterProfileWrite(secondId, profileId, decidedAt),
        ]);
        const pendingAfterStale = yield* Proposals.findByIdForProfile(secondId, profileId);
        const retried = yield* acceptProposal(
          database,
          profileId,
          secondId,
          "2026-08-25T03:00:00.003Z",
          (latest) => ({ ...latest, skills: [...latest.skills, "SQLite"] }),
        );
        return {
          firstVector,
          staleVector,
          pendingAfterStale,
          retried,
          current: yield* profiles.getVersioned(profileId),
        };
      }),
    );

    expect(result.firstVector).toEqual([1, 1]);
    expect(result.staleVector).toEqual([0, 0]);
    expect(result.pendingAfterStale?.status).toBe("pending");
    expect(result.retried?.profile.skills).toEqual(["TypeScript", "SQLite"]);
    expect(result.current).toEqual(result.retried);
  });

  it("linearizes accept/discard in either order and never applies the loser", async () => {
    const result = await run(
      Effect.gen(function* () {
        const database = yield* Database;
        const profiles = yield* Profiles;
        const acceptFirstId = decodeProposalId("proposal-accept-first");
        const discardFirstId = decodeProposalId("proposal-discard-first");
        yield* Proposals.insert(proposal(acceptFirstId, "skills.0", "Accepted"));
        yield* Proposals.insert(proposal(discardFirstId, "skills.1", "Discarded"));

        const accepted = yield* acceptProposal(
          database,
          profileId,
          acceptFirstId,
          decidedAt,
          (current) => ({ ...current, skills: [...current.skills, "Accepted"] }),
        );
        const discardAfterAccept = yield* Proposals.markDiscarded(
          acceptFirstId,
          profileId,
          decidedAt,
        );
        const discarded = yield* Proposals.markDiscarded(discardFirstId, profileId, decidedAt);
        const acceptAfterDiscard = yield* acceptProposal(
          database,
          profileId,
          discardFirstId,
          decidedAt,
          (current) => ({ ...current, skills: [...current.skills, "Discarded"] }),
        );
        return {
          accepted,
          discardAfterAccept,
          discarded,
          acceptAfterDiscard,
          current: yield* profiles.getVersioned(profileId),
        };
      }),
    );

    expect(result.accepted).toBeDefined();
    expect(result.discardAfterAccept).toBe(0);
    expect(result.discarded).toBe(1);
    expect(result.acceptAfterDiscard).toBeUndefined();
    expect(result.current.profile.skills).toEqual(["Accepted"]);
  });

  it("scopes accept and discard to the owner", async () => {
    const result = await run(
      Effect.gen(function* () {
        const database = yield* Database;
        const profiles = yield* Profiles;
        const id = decodeProposalId("proposal-owner");
        yield* Proposals.insert(proposal(id, "skills.0", "Private"));

        const foreignAccept = yield* acceptProposal(
          database,
          otherProfileId,
          id,
          decidedAt,
          (current) => ({ ...current, skills: [...current.skills, "Private"] }),
        );
        const foreignDiscard = yield* Proposals.markDiscarded(id, otherProfileId, decidedAt);
        return {
          foreignAccept,
          foreignDiscard,
          foreignRead: yield* Proposals.findByIdForProfile(id, otherProfileId),
          ownerRead: yield* Proposals.findByIdForProfile(id, profileId),
          foreignProfile: yield* profiles.getVersioned(otherProfileId),
        };
      }),
    );

    expect(result.foreignAccept).toBeUndefined();
    expect(result.foreignDiscard).toBe(0);
    expect(result.foreignRead).toBeUndefined();
    expect(result.ownerRead?.status).toBe("pending");
    expect(result.foreignProfile.profileUpdatedAt).toBeNull();
  });

  it("leaves a proposal pending on a deliberately stale profile, then preserves an ordinary save on retry", async () => {
    const result = await run(
      Effect.gen(function* () {
        const database = yield* Database;
        const profiles = yield* Profiles;
        const initial = yield* profiles.setVersioned(profileId, blank, null).pipe(Effect.orDie);
        const id = decodeProposalId("proposal-after-save");
        yield* Proposals.insert(proposal(id, "skills.0", "TypeScript"));

        const observed = yield* readProfileRow(database, profileId);
        if (observed === undefined) return yield* Effect.die("missing seeded profile");
        const staleWrite = profileWriteForPendingProposal(
          profileId,
          { ...toDomainProfile(observed), skills: ["TypeScript"] },
          id,
          observed,
          decidedAt,
        );
        const ordinary = yield* profiles
          .setVersioned(
            profileId,
            { ...blank, summary: "Saved in another tab" },
            initial.profileUpdatedAt,
          )
          .pipe(Effect.orDie);
        const staleVector = yield* database.atomicAffected([
          staleWrite.write,
          Proposals.markAcceptedAfterProfileWrite(id, profileId, decidedAt),
        ]);
        const pending = yield* Proposals.findByIdForProfile(id, profileId);
        const retried = yield* acceptProposal(database, profileId, id, decidedAt, (current) => ({
          ...current,
          skills: [...current.skills, "TypeScript"],
        }));
        return { ordinary, staleVector, pending, retried };
      }),
    );

    expect(result.staleVector).toEqual([0, 0]);
    expect(result.pending?.status).toBe("pending");
    expect(result.retried?.profile.summary).toBe("Saved in another tab");
    expect(result.retried?.profile.skills).toEqual(["TypeScript"]);
    expect(result.retried?.profileUpdatedAt).not.toBe(result.ordinary.profileUpdatedAt);
  });

  it("rejects a stale whole-profile PUT after accept and keeps the accepted merge", async () => {
    const result = await run(
      Effect.gen(function* () {
        const database = yield* Database;
        const profiles = yield* Profiles;
        const before = yield* profiles.setVersioned(profileId, blank, null).pipe(Effect.orDie);
        const id = decodeProposalId("proposal-before-stale-put");
        yield* Proposals.insert(proposal(id, "skills.0", "TypeScript"));
        const accepted = yield* acceptProposal(database, profileId, id, decidedAt, (current) => ({
          ...current,
          skills: [...current.skills, "TypeScript"],
        }));
        const stalePut = yield* Effect.exit(
          profiles.setVersioned(
            profileId,
            { ...blank, headline: "Stale replacement" },
            before.profileUpdatedAt,
          ),
        );
        return {
          accepted,
          stalePut,
          current: yield* profiles.getVersioned(profileId),
        };
      }),
    );

    expect(result.stalePut._tag).toBe("Failure");
    expect(result.current).toEqual(result.accepted);
    expect(result.current.profile.skills).toEqual(["TypeScript"]);
    expect(result.current.profile.headline).toBe("");
  });

  it("keeps the original proposed value when an edited value is accepted", async () => {
    const result = await run(
      Effect.gen(function* () {
        const database = yield* Database;
        const id = decodeProposalId("proposal-edited");
        yield* Proposals.insert(proposal(id, "skills.0", "TypeScript"));
        const accepted = yield* acceptProposal(database, profileId, id, decidedAt, (current) => ({
          ...current,
          skills: [...current.skills, "Bun"],
        }));
        return {
          accepted,
          stored: yield* Proposals.findByIdForProfile(id, profileId),
        };
      }),
    );

    expect(result.accepted?.profile.skills).toEqual(["Bun"]);
    expect(result.stored?.proposedValue).toBe("TypeScript");
    expect(result.stored?.status).toBe("accepted");
  });

  it("rolls the profile-first write back when the proposal follower violates a constraint", async () => {
    const result = await run(
      Effect.gen(function* () {
        const database = yield* Database;
        const profiles = yield* Profiles;
        const id = decodeProposalId("proposal-rollback");
        yield* Proposals.insert(proposal(id, "skills.0", "TypeScript"));
        const profileWrite = profileWriteForPendingProposal(
          profileId,
          { ...blank, skills: ["TypeScript"] },
          id,
          undefined,
          decidedAt,
        );
        const exit = yield* Effect.exit(
          database.atomicAffected([
            profileWrite.write,
            {
              sql: "UPDATE proposals SET status = 'invalid', decidedAt = ? WHERE id = ? AND profileId = ? AND status = 'pending' AND changes() = 1",
              bindings: [decidedAt, id, profileId],
            },
          ]),
        );
        return {
          exit,
          current: yield* profiles.getVersioned(profileId),
          stored: yield* Proposals.findByIdForProfile(id, profileId),
        };
      }),
    );

    expect(result.exit._tag).toBe("Failure");
    expect(result.current).toEqual({ profile: blank, profileUpdatedAt: null });
    expect(result.stored?.status).toBe("pending");
  });
});
