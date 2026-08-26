import { describe, expect, it } from "vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { StudioDocument } from "@job-index/domain/Documents";
import { DocumentId, ProfileId } from "@job-index/domain/Ids";
import type { JobSnapshot } from "@job-index/domain/Job";
import { runTest as run } from "../TestLayer.ts";
import * as Documents from "./Documents.ts";

const now = DateTime.makeUnsafe("2026-08-01T00:00:00.000Z");
const decodeProfileId = Schema.decodeUnknownSync(ProfileId);
const decodeDocumentId = Schema.decodeUnknownSync(DocumentId);

const snapshot: JobSnapshot = {
  title: "Frontendutvikler",
  employerName: "Nordic Tech AS",
  location: "Oslo",
  description: "TypeScript og React.",
  applicationUrl: "https://example.com/advert",
  publishedAt: "2026-08-01T00:00:00Z",
};

const document = (
  overrides: Partial<{
    id: string;
    profileId: string;
    kind: StudioDocument["kind"];
    jobId: string | null;
    jobSnapshot: JobSnapshot | null;
    createdAt: string;
    content: string;
  }> = {},
) =>
  new StudioDocument({
    id: decodeDocumentId(overrides.id ?? "doc-1"),
    profileId: decodeProfileId(overrides.profileId ?? "profile-1"),
    jobId:
      overrides.jobId === undefined || overrides.jobId === null
        ? Option.none()
        : Option.some(overrides.jobId as never),
    jobSnapshot:
      overrides.jobSnapshot === undefined || overrides.jobSnapshot === null
        ? Option.none()
        : Option.some(overrides.jobSnapshot),
    kind: overrides.kind ?? "cv",
    engine: "template",
    content: overrides.content ?? "Frontend engineer\nOslo",
    createdAt:
      overrides.createdAt === undefined
        ? now
        : DateTime.makeUnsafe(`2026-08-01T00:${overrides.createdAt}:00.000Z`),
    updatedAt: now,
  });

describe("Documents repository", () => {
  it("inserts and reads a general document back", async () => {
    const result = await run(
      Effect.gen(function* () {
        yield* Documents.insert(document());
        return yield* Documents.findByIdForProfile(
          decodeDocumentId("doc-1"),
          decodeProfileId("profile-1"),
        );
      }),
    );
    expect(Option.isNone(result!.jobId)).toBe(true);
    expect(Option.isNone(result!.jobSnapshot)).toBe(true);
  });

  it("round-trips a targeted document's frozen snapshot as semantic JSON", async () => {
    const result = await run(
      Effect.gen(function* () {
        yield* Documents.insert(
          document({ id: "doc-targeted", jobId: "saved_1", jobSnapshot: snapshot }),
        );
        return yield* Documents.findByIdForProfile(
          decodeDocumentId("doc-targeted"),
          decodeProfileId("profile-1"),
        );
      }),
    );
    expect(Option.isSome(result!.jobId)).toBe(true);
    expect(Option.isSome(result!.jobSnapshot)).toBe(true);
    const frozen = Option.getOrThrow(result!.jobSnapshot);
    expect(frozen.title).toBe("Frontendutvikler");
    expect(frozen.employerName).toBe("Nordic Tech AS");
  });

  it("another principal's id is indistinguishable from a missing one", async () => {
    const found = await run(
      Effect.gen(function* () {
        yield* Documents.insert(document());
        return yield* Documents.findByIdForProfile(
          decodeDocumentId("doc-1"),
          decodeProfileId("profile-2"),
        );
      }),
    );
    expect(found).toBeUndefined();
  });

  it("pages newest-first with the fixed limit and a terminal cursor", async () => {
    const rows = await run(
      Effect.gen(function* () {
        for (let index = 0; index < 55; index++) {
          const minute = String(index).padStart(2, "0");
          yield* Documents.insert(
            document({
              id: `doc-${minute}`,
              createdAt: minute,
              content: `document ${index}`,
            }),
          );
        }
        return {
          first: yield* Documents.findByProfilePage(decodeProfileId("profile-1"), 0),
          second: yield* Documents.findByProfilePage(decodeProfileId("profile-1"), 50),
        };
      }),
    );
    expect(rows.first.data).toHaveLength(50);
    // Newest first: doc-54 leads.
    expect(rows.first.data[0]?.id).toBe("doc-54");
    expect(rows.first.nextCursor).toBe("50");
    expect(rows.second.data).toHaveLength(5);
    expect(rows.second.nextCursor).toBeNull();
  });

  it("updates content owner-scoped and reports zero affected rows for a foreign id", async () => {
    const counts = await run(
      Effect.gen(function* () {
        yield* Documents.insert(document({ content: "original" }));
        const own = yield* Documents.updateContent(
          decodeDocumentId("doc-1"),
          decodeProfileId("profile-1"),
          "edited by owner",
          DateTime.formatIso(DateTime.nowUnsafe()),
        );
        const foreign = yield* Documents.updateContent(
          decodeDocumentId("doc-1"),
          decodeProfileId("profile-2"),
          "hijack attempt",
          DateTime.formatIso(DateTime.nowUnsafe()),
        );
        return { own, foreign };
      }),
    );
    expect(counts.own).toBe(1);
    expect(counts.foreign).toBe(0);
    const after = await run(
      Documents.findByIdForProfile(decodeDocumentId("doc-1"), decodeProfileId("profile-1")),
    );
    expect(after?.content).toBe("edited by owner");
    expect(after?.updatedAt).not.toBeNull();
  });

  it("deletes exactly one owner-scoped row", async () => {
    const remaining = await run(
      Effect.gen(function* () {
        yield* Documents.insert(document());
        yield* Documents.insert(
          document({ id: "doc-2", kind: "letter", content: "Kind regards," }),
        );
        yield* Documents.deleteByIdForProfile(
          decodeDocumentId("doc-1"),
          decodeProfileId("profile-1"),
        );
        const foreign = yield* Documents.deleteByIdForProfile(
          decodeDocumentId("doc-2"),
          decodeProfileId("profile-2"),
        );
        const left = yield* Documents.findByProfilePage(decodeProfileId("profile-1"), 0);
        return { foreign, left };
      }),
    );
    expect(remaining.foreign).toBe(0);
    expect(remaining.left.data).toHaveLength(1);
    expect(remaining.left.data[0]?.kind).toBe("letter");
  });
});
