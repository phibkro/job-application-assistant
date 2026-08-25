import { describe, expect, it } from "vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Proposal } from "@job-index/domain/Proposals";
import { ProfileId, ProposalId } from "@job-index/domain/Ids";
import { runTest as run } from "../TestLayer.ts";
import { Database } from "../../services/Database.ts";
import * as Proposals from "./Proposals.ts";

const now = DateTime.nowUnsafe();
const decodeProfileId = Schema.decodeUnknownSync(ProfileId);
const decodeProposalId = Schema.decodeUnknownSync(ProposalId);

const proposal = (
  overrides: Partial<{ id: string; status: Proposal["status"]; profileId: string }> = {},
) =>
  new Proposal({
    id: decodeProposalId(overrides.id ?? "prop-1"),
    profileId: decodeProfileId(overrides.profileId ?? "profile-1"),
    sourceKind: "text",
    fieldPath: "skills.0",
    proposedValue: "TypeScript",
    evidenceExcerpt: "TypeScript, React, CSS",
    confidence: "high",
    engine: "heuristic",
    status: overrides.status ?? "pending",
    createdAt: now,
    decidedAt: Option.none(),
  });

describe("Proposals repository", () => {
  it("inserts and reads a pending proposal back with its value decoded", async () => {
    const result = await run(
      Effect.gen(function* () {
        yield* Proposals.insert(proposal());
        return yield* Proposals.findPendingByProfile(decodeProfileId("profile-1"));
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.fieldPath).toBe("skills.0");
    expect(result[0]?.proposedValue).toBe("TypeScript");
    expect(String(result[0]?.evidenceExcerpt)).toContain("React");
  });

  it("round-trips an Experience proposal as semantic JSON, not a quoted blob", async () => {
    const experience = {
      title: "Senior Baker",
      employer: "Bakery AS",
      period: "2018 - present",
      highlights: ["Runs the sourdough programme"],
    };
    const result = await run(
      Effect.gen(function* () {
        yield* Proposals.insert(
          new Proposal({
            id: decodeProposalId("prop-experience"),
            profileId: decodeProfileId("profile-1"),
            sourceKind: "text",
            fieldPath: "experience.0",
            proposedValue: experience,
            evidenceExcerpt: "Senior Baker - Bakery AS · 2018 - present",
            confidence: "high",
            engine: "heuristic",
            status: "pending",
            createdAt: now,
            decidedAt: Option.none(),
          }),
        );
        return yield* Proposals.findById(decodeProposalId("prop-experience"));
      }),
    );

    expect(result?.proposedValue).toEqual(experience);
  });

  it("findPendingByProfile serves pending only — decided rows are unreachable by query", async () => {
    const result = await run(
      Effect.gen(function* () {
        yield* Proposals.insert(proposal({ id: "prop-1" }));
        yield* Proposals.insert(proposal({ id: "prop-2" }));
        yield* Proposals.markDiscarded(
          decodeProposalId("prop-1"),
          decodeProfileId("profile-1"),
          DateTime.formatIso(now),
        );
        yield* Proposals.markDiscarded(
          decodeProposalId("prop-2"),
          decodeProfileId("profile-1"),
          DateTime.formatIso(now),
        );
        return yield* Proposals.findPendingByProfile(decodeProfileId("profile-1"));
      }),
    );
    expect(result).toHaveLength(0);
  });

  it("markDiscarded records the decision and timestamp on exactly one owner-scoped row", async () => {
    const result = await run(
      Effect.gen(function* () {
        yield* Proposals.insert(proposal({ id: "prop-1" }));
        yield* Proposals.insert(proposal({ id: "prop-2", profileId: "profile-2" }));
        yield* Proposals.markDiscarded(
          decodeProposalId("prop-1"),
          decodeProfileId("profile-1"),
          DateTime.formatIso(now),
        );
        const row = yield* Proposals.findById(decodeProposalId("prop-1"));
        const other = yield* Proposals.findById(decodeProposalId("prop-2"));
        return { row, other };
      }),
    );
    expect(result.row?.status).toBe("discarded");
    expect(Option.isSome(result.row?.decidedAt ?? Option.none())).toBe(true);
    expect(result.other?.status).toBe("pending");
  });

  it("deleteByProfile removes every proposal for that profile only", async () => {
    const after = await run(
      Effect.gen(function* () {
        yield* Proposals.insert(proposal({ id: "prop-3" }));
        yield* Proposals.insert(proposal({ id: "prop-4", profileId: "profile-2" }));
        const write = Proposals.deleteByProfileWrite(decodeProfileId("profile-1"));
        const db = yield* Database;
        yield* db.run(write.sql, write.bindings);
        const p1 = yield* Proposals.findPendingByProfile(decodeProfileId("profile-1"));
        const p2 = yield* Proposals.findPendingByProfile(decodeProfileId("profile-2"));
        return { p1: p1.length, p2: p2.length };
      }),
    );
    expect(after.p1).toBe(0);
    expect(after.p2).toBe(1);
  });
});
