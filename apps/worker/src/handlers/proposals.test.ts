import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Layer from "effect/Layer";
import { Accounts, Profiles, StaleProfileWrite } from "../services/Accounts.ts";
import type { Credential } from "@job-index/domain/Access";
import { Profile as ProfileSchema } from "@job-index/domain/Profile";
import type { Profile } from "@job-index/domain/Profile";
import type { PrincipalId } from "@job-index/domain/Ids";
import { Entitlements } from "../services/Entitlements.ts";
import { Extraction } from "../services/Extraction.ts";
import {
  layer as extractionLayer,
  layerWithPdfSeam,
  NO_EXTRACTABLE_PDF_TEXT_REASON,
  PDF_PARSE_FAILURE_REASON,
  PDF_TOO_LARGE_REASON,
} from "../extraction/index.ts";
import { HeuristicInference, ModelInference } from "../services/Inference.ts";
import type { ProposalDraft } from "../services/Inference.ts";
import { Database } from "../services/Database.ts";
import { buildHandler } from "./testSupport.ts";

/**
 * WS-0016 acceptance (b) and (e): the proposal lifecycle — accept merges
 * through the profile repository's atomic set composition and closes the row;
 * discard touches nothing; GET
 * serves pending only and a decided row is unreachable by any route — plus
 * the 402 gate for the model tier, mirroring the model-drafting tests.
 */

const authHeaders = { Authorization: "Bearer good-token" };

const PDF_B64 =
  "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA1OSA+PgpzdHJlYW0KQlQgL0YxIDE4IFRmIDcyIDcwMCBUZCAoS2FyaSBOb3JkbWFubiAtIFNlbmlvciBCYWtlcikgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDAzNTAgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo0MjAKJSVFT0Y=";

const post = (path: string, body: unknown) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const get = (path: string) =>
  new Request(`http://localhost${path}`, { method: "GET", headers: authHeaders });

/** A stored proposal row the fakes can serve. */
interface StoredProposal {
  id: string;
  profileId: string;
  sourceKind: "text" | "pdf";
  fieldPath: string;
  proposedValue: string;
  evidenceExcerpt: string;
  confidence: "high" | "medium" | "low";
  engine: "heuristic" | "model";
  status: string;
  createdAt: string;
  decidedAt: string | null;
}

let store: Array<StoredProposal>;

const resetStore = () => {
  store = [
    {
      id: "prop-1",
      profileId: "alice",
      sourceKind: "text",
      fieldPath: "headline",
      proposedValue: JSON.stringify("Senior Baker"),
      evidenceExcerpt: "Senior Baker with ten years of experience",
      confidence: "medium",
      engine: "heuristic",
      status: "pending",
      createdAt: "2026-08-24T10:00:00.000Z",
      decidedAt: null,
    },
    {
      id: "prop-2",
      profileId: "alice",
      sourceKind: "text",
      fieldPath: "skills.0",
      proposedValue: JSON.stringify("Sourdough"),
      evidenceExcerpt: "Skills: Sourdough, Laminated pastry",
      confidence: "high",
      engine: "heuristic",
      status: "pending",
      createdAt: "2026-08-24T10:00:00.000Z",
      decidedAt: null,
    },
    {
      id: "prop-other",
      profileId: "bob",
      sourceKind: "text",
      fieldPath: "skills.0",
      proposedValue: JSON.stringify("Welding"),
      evidenceExcerpt: "Skills: Welding",
      confidence: "high",
      engine: "heuristic",
      status: "pending",
      createdAt: "2026-08-24T10:00:00.000Z",
      decidedAt: null,
    },
  ];
};

const emptyProfile: Profile = {
  headline: "",
  summary: "",
  location: "",
  languages: "",
  skills: [],
  experience: [],
  education: [],
};

interface ProfileState {
  value: Profile;
  updatedAt: string | null;
}

interface ForcedAcceptConflicts {
  remaining: number;
  attempts: number;
}

const encodeProfile = Schema.encodeSync(Schema.fromJsonString(ProfileSchema));
const decodeProfile = Schema.decodeUnknownSync(Schema.fromJsonString(ProfileSchema));

const insertProposal = (bindings: ReadonlyArray<unknown>): number => {
  const [
    id,
    profileId,
    sourceKind,
    fieldPath,
    proposedValue,
    evidenceExcerpt,
    confidence,
    engine,
    status,
    createdAt,
    decidedAt,
  ] = bindings as [
    string,
    string,
    "text" | "pdf",
    string,
    string,
    string,
    "high" | "medium" | "low",
    "heuristic" | "model",
    "pending",
    string,
    null,
  ];
  store.push({
    id,
    profileId,
    sourceKind,
    fieldPath,
    proposedValue,
    evidenceExcerpt,
    confidence,
    engine,
    status,
    createdAt,
    decidedAt,
  });
  return 1;
};

const databaseFake = (
  profile: ProfileState,
  forcedConflicts?: ForcedAcceptConflicts,
): Layer.Layer<Database> =>
  Layer.succeed(Database, {
    query: <A>(sql: string, bindings: ReadonlyArray<unknown>) => {
      if (sql.includes("FROM profiles")) {
        const rows =
          profile.updatedAt === null
            ? []
            : [
                {
                  profileId: "alice",
                  cv: encodeProfile(profile.value),
                  erasure: JSON.stringify({ _tag: "Active" }),
                  createdAt: "2026-08-24T09:00:00.000Z",
                  updatedAt: profile.updatedAt,
                },
              ];
        return Effect.succeed(rows as unknown as ReadonlyArray<A>);
      }
      const [first, second] = bindings;
      const pendingOnly = sql.includes("status = 'pending'");
      const rows = store.filter(
        (row) =>
          (second === undefined
            ? row.profileId === first || row.id === first
            : row.id === first && row.profileId === second) &&
          (!pendingOnly || row.status === "pending"),
      );
      return Effect.succeed(rows as unknown as ReadonlyArray<A>);
    },
    run: (sql: string, bindings: ReadonlyArray<unknown>) =>
      Effect.sync(() => {
        if (!sql.includes("INSERT INTO proposals")) {
          throw new Error(`unexpected proposal test write: ${sql}`);
        }
        insertProposal(bindings);
      }),
    runAffected: (sql: string, bindings: ReadonlyArray<unknown>) =>
      Effect.sync(() => {
        if (!sql.includes("status = 'discarded'")) {
          throw new Error(`unexpected proposal affected write: ${sql}`);
        }
        const [decidedAt, id, profileId] = bindings as [string, string, string];
        const row = store.find(
          (candidate) =>
            candidate.id === id &&
            candidate.profileId === profileId &&
            candidate.status === "pending",
        );
        if (row === undefined) return 0;
        row.status = "discarded";
        row.decidedAt = decidedAt;
        return 1;
      }),
    atomicAffected: (writes) =>
      Effect.sync(() => {
        let previousChanges = 0;
        const affected: Array<number> = [];
        for (const write of writes) {
          if (write.sql.includes("updateProfileForPendingProposal")) {
            if (forcedConflicts !== undefined) forcedConflicts.attempts += 1;
            if (forcedConflicts !== undefined && forcedConflicts.remaining > 0) {
              forcedConflicts.remaining -= 1;
              previousChanges = 0;
            } else {
              const [
                cv,
                updatedAt,
                profileId,
                priorCv,
                priorUpdatedAt,
                _activeErasure,
                proposalId,
                owner,
              ] = write.bindings as [
                string,
                string,
                string,
                string,
                string,
                string,
                string,
                string,
              ];
              const pending = store.some(
                (row) =>
                  row.id === proposalId && row.profileId === owner && row.status === "pending",
              );
              if (
                profileId === "alice" &&
                profile.updatedAt === priorUpdatedAt &&
                encodeProfile(profile.value) === priorCv &&
                pending
              ) {
                profile.value = decodeProfile(cv);
                profile.updatedAt = updatedAt;
                previousChanges = 1;
              } else {
                previousChanges = 0;
              }
            }
          } else if (write.sql.includes("insertProfileForPendingProposal")) {
            if (forcedConflicts !== undefined) forcedConflicts.attempts += 1;
            if (forcedConflicts !== undefined && forcedConflicts.remaining > 0) {
              forcedConflicts.remaining -= 1;
              previousChanges = 0;
            } else {
              const [
                profileId,
                cv,
                _erasure,
                _aiAssist,
                _createdAt,
                updatedAt,
                _missing,
                proposalId,
                owner,
              ] = write.bindings as [
                string,
                string,
                string,
                number,
                string,
                string,
                string,
                string,
                string,
              ];
              const pending = store.some(
                (row) =>
                  row.id === proposalId && row.profileId === owner && row.status === "pending",
              );
              if (profileId === "alice" && profile.updatedAt === null && pending) {
                profile.value = decodeProfile(cv);
                profile.updatedAt = updatedAt;
                previousChanges = 1;
              } else {
                previousChanges = 0;
              }
            }
          } else if (write.sql.includes("status = 'accepted'")) {
            const [decidedAt, id, profileId] = write.bindings as [string, string, string];
            const row = store.find(
              (candidate) =>
                candidate.id === id &&
                candidate.profileId === profileId &&
                candidate.status === "pending",
            );
            if (previousChanges === 1 && row !== undefined) {
              row.status = "accepted";
              row.decidedAt = decidedAt;
              previousChanges = 1;
            } else {
              previousChanges = 0;
            }
          } else {
            throw new Error(`unexpected proposal atomic write: ${write.sql}`);
          }
          affected.push(previousChanges);
        }
        return affected;
      }),
    atomic: (writes) =>
      Effect.sync(() => {
        if (writes.length !== 0) {
          throw new Error("proposal tests exercise decision batches through atomicAffected");
        }
      }),
  });

const profilesFake = (
  current: Profile,
  consent: boolean = true,
  onConsent: () => void = () => undefined,
) => {
  const state: ProfileState = {
    value: current,
    updatedAt: "2026-08-24T09:00:00.000Z",
  };
  const layer = Layer.succeed(Profiles, {
    get: () => Effect.succeed(state.value),
    set: (_profile, value) => {
      state.value = value;
      return Effect.succeed(value);
    },
    getVersioned: () =>
      Effect.succeed({
        profile: state.value,
        profileUpdatedAt: state.updatedAt,
      }),
    setVersioned: (_profile, value, expectedUpdatedAt) => {
      if (expectedUpdatedAt !== state.updatedAt) {
        return Effect.fail(
          new StaleProfileWrite({
            expectedUpdatedAt,
            actualUpdatedAt: state.updatedAt,
          }),
        );
      }
      state.value = value;
      state.updatedAt = "2026-08-24T09:00:00.001Z";
      return Effect.succeed({
        profile: state.value,
        profileUpdatedAt: state.updatedAt,
      });
    },
    answers: () => Effect.die("unused"),
    answer: () => Effect.die("unused"),
    unanswered: () => Effect.die("unused"),
    aiConsent: () =>
      Effect.sync(() => {
        onConsent();
        return consent;
      }),
    setAiConsent: () => Effect.die("Profiles.setAiConsent"),
  });
  return { layer, state };
};
const entitlementsFake = (granted: boolean) =>
  Layer.succeed(Entitlements, {
    has: () => Effect.die("model inference must use Entitlements.require"),
    require: () =>
      granted
        ? Effect.void
        : Effect.fail({ _tag: "EntitlementRequired", capability: "model-inference" } as never),
  } as never);

const extractionFake = Layer.succeed(Extraction, {
  extract: ({ content }: { content: string }) =>
    Effect.succeed({ sourceKind: "text", text: content }),
} as never);

const drafts: ReadonlyArray<ProposalDraft> = [
  {
    fieldPath: "summary",
    proposedValue: "Baker of ten years.",
    evidenceExcerpt: "Baker of ten years.",
    confidence: "high",
  },
];

const heuristicFake = Layer.succeed(HeuristicInference, {
  propose: () => Effect.succeed(drafts),
} as never);

const modelUnavailableFake = Layer.succeed(ModelInference, {
  propose: () => Effect.fail({ _tag: "ModelUnavailable", reason: "no binding" } as never),
} as never);

const authedAs = (profileId: string) => {
  const credential: Credential = { _tag: "Session", principal: "p1" as PrincipalId, session: "s1" };
  return Layer.succeed(Accounts, {
    authenticate: () => Effect.succeed(credential),
    profileOf: () => Effect.succeed(profileId as never),
    requestErasure: () => Effect.die("unused"),
  } as never);
};

const buildWith = async (
  overrides: {
    profiles?: ReturnType<typeof profilesFake>;
    entitlements?: ReturnType<typeof entitlementsFake>;
    extraction?: Layer.Layer<Extraction>;
    heuristic?: Layer.Layer<HeuristicInference>;
    model?: Layer.Layer<ModelInference>;
    conflicts?: ForcedAcceptConflicts;
  } = {},
) => {
  resetStore();
  const profileFixture = overrides.profiles ?? profilesFake({ ...emptyProfile });
  const { handler } = buildHandler({
    accounts: authedAs("alice"),
    database: databaseFake(profileFixture.state, overrides.conflicts),
    profiles: profileFixture.layer,
    entitlements:
      overrides.entitlements ??
      Layer.succeed(Entitlements, {
        has: () => Effect.die("unused"),
        require: () => Effect.die("unused"),
      } as never),
    extraction: overrides.extraction ?? extractionFake,
    heuristicInference: overrides.heuristic ?? heuristicFake,
    modelInference: overrides.model ?? modelUnavailableFake,
  });
  return handler;
};

describe("POST /api/v1/me/profile/proposals", () => {
  it("runs heuristics by default without consulting entitlements", async () => {
    const handler = await buildWith();
    const res = await handler(
      post("/api/v1/me/profile/proposals", {
        content: "Some pasted CV text",
        mimeType: "text/plain",
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      fieldPath: "summary",
      status: "pending",
      engine: "heuristic",
      sourceKind: "text",
    });
    expect(body.data[0].evidenceExcerpt).toContain("Baker");
    expect(store.some((r) => r.fieldPath === "summary")).toBe(true);
    // No raw content column/table anywhere: only conclusions persisted.
    expect(JSON.stringify(store)).not.toContain("Some pasted CV text");
  });

  it("default heuristic invokes neither consent nor entitlements", async () => {
    const profileFixture = profilesFake({ ...emptyProfile }, true, () => {
      throw new Error("consent must not be consulted");
    });
    const handler = await buildWith({
      profiles: profileFixture,
      entitlements: Layer.succeed(Entitlements, {
        has: () => Effect.die("entitlements must not be consulted"),
        require: () => Effect.die("entitlements must not be consulted"),
      } as never),
    });
    expect(
      (
        await handler(
          post("/api/v1/me/profile/proposals", {
            content: "Some pasted CV text",
            mimeType: "text/plain",
          }),
        )
      ).status,
    ).toBe(200);
  });

  it("persists only drafts that satisfy the frozen field-path grammar and target schema", async () => {
    const handler = await buildWith({
      heuristic: Layer.succeed(HeuristicInference, {
        propose: () =>
          Effect.succeed([
            {
              fieldPath: "skills.*",
              proposedValue: "invalid legacy path",
              evidenceExcerpt: "legacy",
              confidence: "high",
            },
            {
              fieldPath: "summary",
              proposedValue: { invalid: true },
              evidenceExcerpt: "wrong shape",
              confidence: "high",
            },
            {
              fieldPath: "headline",
              proposedValue: "Senior Baker",
              evidenceExcerpt: "x".repeat(400),
              confidence: "high",
            },
          ]),
      }),
    });
    const res = await handler(
      post("/api/v1/me/profile/proposals", { content: "CV", mimeType: "text/plain" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].fieldPath).toBe("headline");
    expect(body.data[0].evidenceExcerpt.length).toBeLessThanOrEqual(300);
  });

  it("maps an unsupported MIME through Extraction to tagged 400", async () => {
    const handler = await buildWith({ extraction: extractionLayer });
    const res = await handler(
      post("/api/v1/me/profile/proposals", {
        content: "not a supported document",
        mimeType: "text/docx",
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      _tag: "UnsupportedDocument",
      message: "unsupported document type: text/docx",
    });
  });

  it("accepts a real embedded-text PDF without retaining its raw bytes", async () => {
    const handler = await buildWith({ extraction: extractionLayer });
    const response = await handler(
      post("/api/v1/me/profile/proposals", {
        content: PDF_B64,
        mimeType: "application/pdf",
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ sourceKind: "pdf", fieldPath: "summary" });
    expect(JSON.stringify(store)).not.toContain(PDF_B64);
  });

  it("rejects oversized PDF base64 through the real handler boundary", async () => {
    const handler = await buildWith({ extraction: extractionLayer });
    const response = await handler(
      post("/api/v1/me/profile/proposals", {
        content: `${"A".repeat(699_055)}=`,
        mimeType: "application/pdf",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      _tag: "UnsupportedDocument",
      message: PDF_TOO_LARGE_REASON,
    });
  });

  it("maps corrupt PDF bytes to a stable handler error", async () => {
    const handler = await buildWith({ extraction: extractionLayer });
    const response = await handler(
      post("/api/v1/me/profile/proposals", {
        content: "bm90IGEgcGRm",
        mimeType: "application/pdf",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      _tag: "UnsupportedDocument",
      message: PDF_PARSE_FAILURE_REASON,
    });
  });

  it("maps image-only PDF extraction to stable OCR guidance", async () => {
    const noTextLayer = layerWithPdfSeam({
      decodeBase64: () => new Uint8Array(8),
      extractText: () => Promise.resolve(" \n "),
    });
    const handler = await buildWith({ extraction: noTextLayer });
    const response = await handler(
      post("/api/v1/me/profile/proposals", {
        content: "JVBERi0xLjQ=",
        mimeType: "application/pdf",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      _tag: "UnsupportedDocument",
      message: NO_EXTRACTABLE_PDF_TEXT_REASON,
    });
  });

  it("round-trips an Experience object through the repository and handler", async () => {
    const experience = {
      title: "Senior Baker",
      employer: "Bakery AS",
      period: "2018 - present",
      highlights: ["Runs the sourdough programme"],
    };
    const current = { ...emptyProfile };
    const handler = await buildWith({
      profiles: profilesFake(current),
      heuristic: Layer.succeed(HeuristicInference, {
        propose: () =>
          Effect.succeed([
            {
              fieldPath: "experience.0",
              proposedValue: experience,
              evidenceExcerpt: "Senior Baker - Bakery AS · 2018 - present",
              confidence: "high",
            },
          ]),
      }),
    });

    const created = await handler(
      post("/api/v1/me/profile/proposals", {
        content: "Senior Baker - Bakery AS",
        mimeType: "text/plain",
      }),
    );
    expect(created.status).toBe(200);
    const createdBody = await created.json();
    const createdProposal = createdBody.data[0];
    expect(JSON.parse(createdProposal.proposedValue)).toEqual(experience);
    expect(createdProposal.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    const listed = await handler(get("/api/v1/me/profile/proposals"));
    expect(listed.status).toBe(200);
    const listedBody = await listed.json();
    const listedExperience = listedBody.data.find(
      (proposal: { fieldPath: string }) => proposal.fieldPath === "experience.0",
    );
    expect(listedExperience).toEqual(createdProposal);

    const accepted = await handler(
      post(`/api/v1/me/profile/proposals/${createdBody.data[0].id}/decision`, {
        decision: "accepted",
      }),
    );
    expect(accepted.status).toBe(200);
    const acceptedBody = await accepted.json();
    expect(acceptedBody.profile.experience).toEqual([experience]);
  });

  it("fails 402 with capability carried when model tier is not entitled", async () => {
    const handler = await buildWith({
      entitlements: entitlementsFake(false),
    });
    const res = await handler(
      post("/api/v1/me/profile/proposals", {
        content: "x",
        mimeType: "text/plain",
        engine: "model",
      }),
    );
    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toEqual({
      _tag: "UpgradeRequired",
      capability: "model-inference",
    });
  });

  for (const entitled of [true, false]) {
    it(`consent OFF returns 403 before capability when entitled=${entitled}`, async () => {
      const handler = await buildWith({
        profiles: profilesFake({ ...emptyProfile }, false),
        entitlements: entitlementsFake(entitled),
      });
      const res = await handler(
        post("/api/v1/me/profile/proposals", {
          content: "x",
          mimeType: "text/plain",
          engine: "model",
        }),
      );
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toMatchObject({ _tag: "ConsentRequired" });
    });
  }

  it("uses the model engine exactly once when entitled", async () => {
    let calls = 0;
    const handler = await buildWith({
      entitlements: entitlementsFake(true),
      model: Layer.succeed(ModelInference, {
        propose: () => {
          calls += 1;
          return Effect.succeed([
            {
              fieldPath: "location",
              proposedValue: "Bergen",
              evidenceExcerpt: "Based in Bergen",
              confidence: "high",
            },
          ]);
        },
      }),
    });
    const res = await handler(
      post("/api/v1/me/profile/proposals", {
        content: "x",
        mimeType: "text/plain",
        engine: "model",
      }),
    );
    expect(res.status).toBe(200);
    expect(calls).toBe(1);
    const body = await res.json();
    expect(body.data[0]).toMatchObject({ fieldPath: "location", engine: "model" });
  });

  it("downgrades to heuristics with a reason when the model tier cannot run", async () => {
    const handler = await buildWith({
      entitlements: entitlementsFake(true),
      model: modelUnavailableFake,
    });
    const res = await handler(
      post("/api/v1/me/profile/proposals", {
        content: "x",
        mimeType: "text/plain",
        engine: "model",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].engine).toBe("heuristic");
    expect(body.downgradeReason).toContain("no binding");
  });
});

describe("GET /api/v1/me/profile/proposals", () => {
  it("serves this principal's pending proposals only", async () => {
    const handler = await buildWith();
    const res = await handler(get("/api/v1/me/profile/proposals"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.map((d: { id: string }) => d.id).toSorted()).toEqual(["prop-1", "prop-2"]);
  });
});

describe("POST /api/v1/me/profile/proposals/:id/decision", () => {
  it("accept atomically merges the profile and marks accepted + decidedAt", async () => {
    const fixture = profilesFake({ ...emptyProfile });
    const handler = await buildWith({ profiles: fixture });
    const res = await handler(
      post("/api/v1/me/profile/proposals/prop-2/decision", { decision: "accepted" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.decision).toBe("accepted");
    expect(body.profile.skills).toEqual(["Sourdough"]);
    expect(body.profileUpdatedAt).toBe(fixture.state.updatedAt);
    expect(body.profile).toEqual(fixture.state.value);
    const row = store.find((r) => r.id === "prop-2");
    expect(row?.status).toBe("accepted");
    expect(typeof row?.decidedAt).toBe("string");
  });

  it("accept with an edited value persists the edited value", async () => {
    const fixture = profilesFake({ ...emptyProfile });
    const handler = await buildWith({ profiles: fixture });
    const res = await handler(
      post("/api/v1/me/profile/proposals/prop-1/decision", {
        decision: "accepted",
        value: JSON.stringify("Head Pastry Chef"),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.headline).toBe("Head Pastry Chef");
    expect(JSON.parse(store.find((row) => row.id === "prop-1")!.proposedValue)).toBe(
      "Senior Baker",
    );
  });

  it("rejects an edited value that does not match the field path with 400", async () => {
    const handler = await buildWith();
    const res = await handler(
      post("/api/v1/me/profile/proposals/prop-1/decision", {
        decision: "accepted",
        value: JSON.stringify({ not: "a string" }),
      }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ _tag: "InvalidProposalValue" });
  });

  it("discard marks discarded and merges nothing", async () => {
    const fixture = profilesFake({ ...emptyProfile, headline: "Untouched" });
    const handler = await buildWith({ profiles: fixture });
    const res = await handler(
      post("/api/v1/me/profile/proposals/prop-1/decision", { decision: "discarded" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.headline).toBe("Untouched");
    expect(body.profileUpdatedAt).toBe(fixture.state.updatedAt);
    expect(store.find((r) => r.id === "prop-1")?.status).toBe("discarded");
  });

  it("rejects a replacement value on discard", async () => {
    const handler = await buildWith();
    const res = await handler(
      post("/api/v1/me/profile/proposals/prop-1/decision", {
        decision: "discarded",
        value: JSON.stringify("must not be accepted"),
      }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ _tag: "InvalidProposalValue" });
    expect(store.find((row) => row.id === "prop-1")?.status).toBe("pending");
  });

  it("a decided row is unreachable: second decision gets 409, list omits it forever", async () => {
    const handler = await buildWith();
    await handler(post("/api/v1/me/profile/proposals/prop-1/decision", { decision: "discarded" }));
    const second = await handler(
      post("/api/v1/me/profile/proposals/prop-1/decision", { decision: "accepted" }),
    );
    expect(second.status).toBe(409);
    await expect(second.json()).resolves.toMatchObject({ _tag: "ProposalAlreadyDecided" });
    const listed = await handler(get("/api/v1/me/profile/proposals"));
    const ids = (await listed.json()).data.map((d: { id: string }) => d.id);
    expect(ids).not.toContain("prop-1");
  });

  it("maps the accept/discard loser to 409 in the opposite order too", async () => {
    const handler = await buildWith();
    const accepted = await handler(
      post("/api/v1/me/profile/proposals/prop-1/decision", { decision: "accepted" }),
    );
    expect(accepted.status).toBe(200);
    const discarded = await handler(
      post("/api/v1/me/profile/proposals/prop-1/decision", { decision: "discarded" }),
    );
    expect(discarded.status).toBe(409);
    await expect(discarded.json()).resolves.toMatchObject({
      _tag: "ProposalAlreadyDecided",
      id: "prop-1",
      status: "accepted",
    });
  });

  it("recomputes from a fresh profile after a lost accept CAS", async () => {
    const conflicts: ForcedAcceptConflicts = { remaining: 1, attempts: 0 };
    const handler = await buildWith({ conflicts });
    const res = await handler(
      post("/api/v1/me/profile/proposals/prop-2/decision", { decision: "accepted" }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      decision: "accepted",
      profile: { skills: ["Sourdough"] },
    });
    expect(conflicts.attempts).toBe(2);
  });

  it("returns retryable ProfileDecisionConflict after exactly three lost attempts", async () => {
    const conflicts: ForcedAcceptConflicts = { remaining: 3, attempts: 0 };
    const handler = await buildWith({ conflicts });
    const res = await handler(
      post("/api/v1/me/profile/proposals/prop-2/decision", { decision: "accepted" }),
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      _tag: "ProfileDecisionConflict",
      id: "prop-2",
      retryable: true,
    });
    expect(conflicts.attempts).toBe(3);
    expect(store.find((row) => row.id === "prop-2")?.status).toBe("pending");
  });

  it("another profile's proposal id is 404", async () => {
    const handler = await buildWith();
    const res = await handler(
      post("/api/v1/me/profile/proposals/prop-other/decision", { decision: "accepted" }),
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ _tag: "NotFound" });
  });
});
