import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import {
  MAX_PDF_PROFILE_FILE_BYTES,
  MAX_TEXT_PROFILE_FILE_BYTES,
  MAX_TEXT_PROFILE_CHARACTERS,
  readProfileFile,
} from "../Commands.ts";
import { NetworkError, NotFound } from "../RequestStatus.ts";
import * as ExperienceEntry from "./ExperienceEntry.ts";
import * as Message from "./Message.ts";
import { init, type Model, type MeResponse } from "./Model.ts";
import { update } from "./update.ts";

/**
 * The profile cluster's own `update`, tested against its own small Model —
 * the localization the Submodel split is for. `SessionCleared`'s "reset via
 * `init`" behaviour and the `UrlChanged`-to-Profile fetch gate are root
 * orchestration and stay covered in `update.test.ts` instead: this file
 * only owns what the Submodel itself decides.
 */

const meResponse: MeResponse = {
  profile: {
    headline: "Engineer",
    summary: "Builds things.",
    location: "Oslo",
    languages: "English",
    skills: ["TypeScript"],
    education: ["BSc"],
    preferences: {
      desiredRoles: ["Frontend"],
      desiredLocations: ["Bergen"],
      excludedTerms: [],
    },
    experience: [
      { title: "Engineer", employer: "Acme", period: "2020-2023", highlights: ["Shipped X"] },
    ],
  },
  capabilities: ["draft"],
  profileUpdatedAt: "2026-08-25T08:00:00.000Z",
};

describe("Requested", () => {
  it("starts loading and asks the server for the profile", () => {
    const [model, commands] = update(init(), Message.Requested());
    expect(model.profile._tag).toBe("Loading");
    expect(commands.map((c) => c.name)).toEqual(["FetchProfile"]);
  });
});

describe("FetchSucceeded / FetchFailed", () => {
  it("FetchSucceeded populates both the cache and a fresh edit buffer from it", () => {
    const [model, commands] = update(init(), Message.FetchSucceeded({ response: meResponse }));
    expect(model.profile).toEqual({ _tag: "Success", data: meResponse });
    expect(Option.isSome(model.profileForm)).toBe(true);
    const form = Option.getOrThrow(model.profileForm);
    expect(form.headline).toBe("Engineer");
    expect(model.profileUpdatedAt).toBe("2026-08-25T08:00:00.000Z");
    expect(form.skillsText).toBe("TypeScript");
    expect(form.desiredRolesText).toBe("Frontend");
    expect(form.desiredLocationsText).toBe("Bergen");
    expect(form.experience).toHaveLength(1);
    expect(form.experience[0]?.title).toBe("Engineer");
    expect(commands.map((command) => command.name)).toEqual(["FetchProposals"]);
  });

  it("FetchFailed on a first load becomes a bare Failure", () => {
    const loading: Model = { ...init(), profile: { _tag: "Loading" } };
    const [model] = update(
      loading,
      Message.FetchFailed({ problem: new NotFound({ message: "no" }) }),
    );
    expect(model.profile._tag).toBe("Failure");
  });
});

describe("field edits", () => {
  const loaded: Model = update(init(), Message.FetchSucceeded({ response: meResponse }))[0];

  it("HeadlineChanged edits only the buffer, never the fetched cache", () => {
    const [model] = update(loaded, Message.HeadlineChanged({ value: "Staff Engineer" }));
    expect(Option.getOrThrow(model.profileForm).headline).toBe("Staff Engineer");
    expect(model.profile).toEqual(loaded.profile);
  });

  it("a field edit before anything has loaded is a no-op — there is no buffer to edit", () => {
    const [model] = update(init(), Message.HeadlineChanged({ value: "x" }));
    expect(model.profileForm).toEqual(Option.none());
  });
});

describe("experience list", () => {
  const loaded: Model = update(init(), Message.FetchSucceeded({ response: meResponse }))[0];

  it("ExperienceAdded appends a fresh entry with its own id", () => {
    const [model] = update(loaded, Message.ExperienceAdded());
    const experience = Option.getOrThrow(model.profileForm).experience;
    expect(experience).toHaveLength(2);
    expect(experience[1]?.id).not.toBe(experience[0]?.id);
    expect(experience[1]?.title).toBe("");
  });

  it("GotExperienceMessage addresses the entry by id, not position", () => {
    const withSecond = update(loaded, Message.ExperienceAdded())[0];
    const [first, second] = Option.getOrThrow(withSecond.profileForm).experience;
    const [model] = update(
      withSecond,
      Message.GotExperienceMessage({
        id: second!.id,
        message: ExperienceEntry.TitleChanged({ value: "Second job" }),
      }),
    );
    const experience = Option.getOrThrow(model.profileForm).experience;
    expect(experience[0]).toEqual(first);
    expect(experience[1]?.title).toBe("Second job");
  });

  it("a RemoveClicked OutMessage removes exactly that entry", () => {
    const withSecond = update(loaded, Message.ExperienceAdded())[0];
    const [first, second] = Option.getOrThrow(withSecond.profileForm).experience;
    const [model] = update(
      withSecond,
      Message.GotExperienceMessage({ id: first!.id, message: ExperienceEntry.RemoveClicked() }),
    );
    const experience = Option.getOrThrow(model.profileForm).experience;
    expect(experience).toEqual([second]);
  });

  it("a message for an id no longer in the list is a no-op", () => {
    const [model] = update(
      loaded,
      Message.GotExperienceMessage({
        id: "does-not-exist",
        message: ExperienceEntry.TitleChanged({ value: "x" }),
      }),
    );
    expect(model).toBe(loaded);
  });
});

describe("SaveClicked", () => {
  it("with no buffer loaded is a no-op", () => {
    const empty = init();
    const [model, commands] = update(empty, Message.SaveClicked());
    expect(model).toBe(empty);
    expect(commands).toEqual([]);
  });

  it("carries the fetched capabilities forward — setProfile cannot change what an account is entitled to", () => {
    const loaded: Model = update(init(), Message.FetchSucceeded({ response: meResponse }))[0];
    const [model, commands] = update(loaded, Message.SaveClicked());
    expect(model.profileSaving).toEqual({ _tag: "Pending" });
    expect(commands.map((c) => c.name)).toEqual(["SaveProfile"]);
    expect(commands[0]?.args).toMatchObject({ capabilities: ["draft"] });
    expect(commands[0]?.args).toMatchObject({
      expectedUpdatedAt: "2026-08-25T08:00:00.000Z",
      generation: 1,
    });
    expect(commands[0]?.args).toMatchObject({
      profile: {
        preferences: {
          desiredRoles: ["Frontend"],
          desiredLocations: ["Bergen"],
          excludedTerms: [],
        },
      },
    });
  });

  it("SaveSucceeded refreshes the cache, advances the revision, and clears Pending", () => {
    const pending: Model = {
      ...update(init(), Message.FetchSucceeded({ response: meResponse }))[0],
      profileSaving: { _tag: "Pending" },
    };
    const response = { ...meResponse, profileUpdatedAt: "2026-08-25T09:00:00.000Z" };
    const [model] = update(
      { ...pending, saveGeneration: 1 },
      Message.SaveSucceeded({
        generation: 1,
        baseProfileUpdatedAt: meResponse.profileUpdatedAt,
        response,
      }),
    );
    expect(model.profileSaving).toEqual({ _tag: "Idle" });
    expect(model.profile).toEqual({ _tag: "Success", data: response });
    expect(model.profileUpdatedAt).toBe("2026-08-25T09:00:00.000Z");
  });

  it("SaveFailed retains the revision and never auto-retries a stale write", () => {
    const pending: Model = {
      ...update(init(), Message.FetchSucceeded({ response: meResponse }))[0],
      profileSaving: { _tag: "Pending" },
    };
    const problem = NetworkError({
      detail: "This profile changed after it loaded. Refresh and try again.",
    });
    const [model, commands] = update(
      { ...pending, saveGeneration: 1 },
      Message.SaveFailed({
        generation: 1,
        baseProfileUpdatedAt: pending.profileUpdatedAt,
        problem,
      }),
    );
    expect(model.profileSaving).toEqual({ _tag: "Failed", problem });
    expect(model.profile).toEqual(pending.profile);
    expect(model.profileUpdatedAt).toBe(pending.profileUpdatedAt);
    expect(commands).toEqual([]);
  });
});

describe("proposal review", () => {
  const proposal = {
    id: "proposal-1",
    sourceKind: "text" as const,
    fieldPath: "headline",
    proposedValue: JSON.stringify("Senior Engineer"),
    evidenceExcerpt: "Senior Engineer",
    confidence: "high" as const,
    engine: "heuristic" as const,
    status: "pending",
    createdAt: "2026-08-25T00:00:00.000Z",
  };
  const structuredProposal = {
    ...proposal,
    id: "proposal-2",
    fieldPath: "experience.0",
    proposedValue: JSON.stringify({
      title: "Engineer",
      employer: "Acme",
      period: "2020–2024",
      highlights: ["Shipped"],
    }),
  };

  const loadedWithProposals = (): Model => ({
    ...update(init(), Message.FetchSucceeded({ response: meResponse }))[0],
    proposals: [proposal, structuredProposal],
    proposalFetch: { _tag: "Idle" },
  });

  it("removes a decided proposal, advances the revision, announces it, and requests focus", () => {
    const [pending] = update(
      {
        ...loadedWithProposals(),
        editedProposalValues: Option.some({ [proposal.id]: "Head Baker" }),
      },
      Message.ProposalDecideClicked({ id: proposal.id, decision: "accepted" }),
    );
    const acceptedProfile = { ...meResponse.profile, headline: "Head Baker" };
    const [model, commands] = update(
      pending,
      Message.ProposalDecisionSucceeded({
        id: proposal.id,
        generation: 1,
        response: {
          decision: "accepted",
          profile: acceptedProfile,
          profileUpdatedAt: "2026-08-25T09:00:00.000Z",
        },
      }),
    );

    expect(model.proposals).toEqual([structuredProposal]);
    expect(model.profileUpdatedAt).toBe("2026-08-25T09:00:00.000Z");
    expect(Option.getOrThrow(model.profileForm).headline).toBe("Head Baker");
    expect(Option.getOrThrow(model.editedProposalValues)).toEqual({});
    expect(model.proposalAnnouncement).toBe("Accepted proposal for headline. 1 proposal remains.");
    expect(commands.map((command) => command.name)).toEqual(["FocusProposalReview"]);
    expect(commands[0]?.args).toEqual({
      selector: `#proposal-editor-${structuredProposal.id}`,
    });
    const [afterLateFetch] = update(
      model,
      Message.ProposalsFetchSucceeded({
        generation: 1,
        response: { data: [proposal, structuredProposal] },
      }),
    );
    expect(afterLateFetch).toBe(model);
  });

  it("keeps a model-inference downgrade reason after the pending-list refresh", () => {
    const importing: Model = {
      ...init(),
      importGeneration: 1,
      importing: { _tag: "Pending" },
    };
    const [imported] = update(
      importing,
      Message.ImportSucceeded({
        generation: 1,
        mimeType: "text/plain",
        response: { data: [proposal], downgradeReason: "Model unavailable; used heuristics." },
      }),
    );
    const [refreshed] = update(
      imported,
      Message.ProposalsFetchSucceeded({
        generation: imported.proposalFetchGeneration,
        response: { data: [proposal] },
      }),
    );

    expect(refreshed.downgradeReason).toBe("Model unavailable; used heuristics.");
  });

  it("records stable empty-PDF feedback without treating an empty queue as a failure", () => {
    const importing: Model = {
      ...init(),
      importGeneration: 1,
      importing: { _tag: "Pending" },
    };
    const [model] = update(
      importing,
      Message.ImportSucceeded({
        generation: 1,
        mimeType: "application/pdf",
        response: { data: [], downgradeReason: null },
      }),
    );

    expect(model.importFeedback).toBe("no-extractable-pdf-text");
    expect(model.importing).toEqual({ _tag: "Idle" });
  });

  it("ignores stale import and fetch completions", () => {
    const firstImportPending: Model = {
      ...init(),
      importGeneration: 1,
      importing: { _tag: "Pending" },
    };
    const [importPending] = update(
      firstImportPending,
      Message.ImportTextChanged({ value: "A newer document" }),
    );
    expect(importPending.importGeneration).toBe(2);
    const [afterImport] = update(
      importPending,
      Message.ImportSucceeded({
        generation: 1,
        mimeType: "text/plain",
        response: { data: [proposal], downgradeReason: null },
      }),
    );
    expect(afterImport).toBe(importPending);

    const fetchPending: Model = {
      ...init(),
      proposalFetchGeneration: 2,
      proposalFetch: { _tag: "Pending" },
    };
    const [afterFetch] = update(
      fetchPending,
      Message.ProposalsFetchFailed({
        generation: 1,
        problem: new NotFound({ message: "stale" }),
      }),
    );
    expect(afterFetch).toBe(fetchPending);
  });

  it("owns import, fetch, and decision failures independently and per proposal id", () => {
    const problem = new NotFound({ message: "no" });
    const [failedImport] = update(
      { ...init(), importGeneration: 1, importing: { _tag: "Pending" } },
      Message.ImportFailed({ generation: 1, problem }),
    );
    expect(failedImport.importing).toEqual({ _tag: "Failed", problem });

    const [failedFetch] = update(
      {
        ...loadedWithProposals(),
        proposalFetchGeneration: 1,
        proposalFetch: { _tag: "Pending" },
      },
      Message.ProposalsFetchFailed({ generation: 1, problem }),
    );
    expect(failedFetch.proposalFetch).toEqual({ _tag: "Failed", problem });

    const [firstPending] = update(
      loadedWithProposals(),
      Message.ProposalDecideClicked({ id: proposal.id, decision: "accepted" }),
    );
    const [bothPending] = update(
      firstPending,
      Message.ProposalDecideClicked({ id: structuredProposal.id, decision: "discarded" }),
    );
    const [failedOne] = update(
      bothPending,
      Message.ProposalDecisionFailed({
        id: proposal.id,
        generation: 1,
        problem,
      }),
    );
    expect(
      failedOne.proposalDecisions.find((candidate) => candidate.id === proposal.id)?.request,
    ).toEqual({ _tag: "Failed", problem });
    expect(
      failedOne.proposalDecisions.find((candidate) => candidate.id === structuredProposal.id)
        ?.request,
    ).toEqual({ _tag: "Pending" });
  });

  it("ignores stale decision success and failure completions for the same proposal id", () => {
    const problem = new NotFound({ message: "first attempt" });
    const [firstPending] = update(
      loadedWithProposals(),
      Message.ProposalDecideClicked({ id: proposal.id, decision: "accepted" }),
    );
    const [firstFailed] = update(
      firstPending,
      Message.ProposalDecisionFailed({ id: proposal.id, generation: 1, problem }),
    );
    const [secondPending] = update(
      firstFailed,
      Message.ProposalDecideClicked({ id: proposal.id, decision: "accepted" }),
    );
    const staleSuccess = Message.ProposalDecisionSucceeded({
      id: proposal.id,
      generation: 1,
      response: {
        decision: "accepted",
        profile: meResponse.profile,
        profileUpdatedAt: meResponse.profileUpdatedAt!,
      },
    });
    const [afterStaleSuccess] = update(secondPending, staleSuccess);
    expect(afterStaleSuccess).toBe(secondPending);

    const [afterStaleFailure] = update(
      secondPending,
      Message.ProposalDecisionFailed({ id: proposal.id, generation: 1, problem }),
    );
    expect(afterStaleFailure).toBe(secondPending);
  });

  it("shows a per-id validation failure for malformed structured JSON without a command", () => {
    const [edited] = update(
      loadedWithProposals(),
      Message.ProposalEditChanged({ id: structuredProposal.id, value: "{bad" }),
    );
    const [model, commands] = update(
      edited,
      Message.ProposalDecideClicked({ id: structuredProposal.id, decision: "accepted" }),
    );

    expect(commands).toEqual([]);
    expect(
      model.proposalDecisions.find((candidate) => candidate.id === structuredProposal.id)?.request,
    ).toMatchObject({
      _tag: "Failed",
      problem: {
        _tag: "NetworkError",
        detail: "Enter a valid JSON object before accepting this proposal.",
      },
    });
  });

  it("routes a native file-input selection through a generated file import request", () => {
    const file = new File(["CV text"], "past-cv.txt", { type: "text/plain" });
    const [selected] = update(init(), Message.ImportFileSelected({ files: [file] }));
    expect(selected.importFileName).toBe("past-cv.txt");
    expect(Option.getOrThrow(selected.importFile)).toBe(file);

    const [pending, commands] = update(selected, Message.ImportClicked());
    expect(pending.importing._tag).toBe("Pending");
    expect(pending.importGeneration).toBe(1);
    expect(commands.map((command) => command.name)).toEqual(["ImportProfileFile"]);
    expect(commands[0]?.args).toMatchObject({ generation: 1 });
  });

  const responseAt = (headline: string, profileUpdatedAt: string): MeResponse => ({
    ...meResponse,
    profile: { ...meResponse.profile, headline },
    profileUpdatedAt,
  });

  const concurrentSaveAndDecision = (): Model => ({
    ...loadedWithProposals(),
    proposals: [proposal],
    profileSaving: { _tag: "Pending" },
    saveGeneration: 1,
    proposalDecisions: [{ id: proposal.id, generation: 1, request: { _tag: "Pending" } }],
  });

  const saveV1 = Message.SaveSucceeded({
    generation: 1,
    baseProfileUpdatedAt: meResponse.profileUpdatedAt,
    response: responseAt("Saved V1", "2026-08-25T09:00:00.000Z"),
  });
  const acceptV2 = Message.ProposalDecisionSucceeded({
    id: proposal.id,
    generation: 1,
    response: {
      decision: "accepted",
      profile: { ...meResponse.profile, headline: "Accepted V2" },
      profileUpdatedAt: "2026-08-25T10:00:00.000Z",
    },
  });

  it.each([
    ["save V1 then accept V2", [saveV1, acceptV2]],
    ["accept V2 then save V1", [acceptV2, saveV1]],
  ] as const)(
    "converges on V2 without cache, revision, or form regression: %s",
    (_label, messages) => {
      const final = messages.reduce(
        (current, message) => update(current, message)[0],
        concurrentSaveAndDecision(),
      );
      expect(final.profileUpdatedAt).toBe("2026-08-25T10:00:00.000Z");
      expect(final.profile).toMatchObject({
        _tag: "Success",
        data: {
          profile: { headline: "Accepted V2" },
          profileUpdatedAt: "2026-08-25T10:00:00.000Z",
        },
      });
      expect(Option.getOrThrow(final.profileForm).headline).toBe("Accepted V2");
      expect(Option.getOrThrow(final.persistedProfileForm).headline).toBe("Accepted V2");
      expect(final.profileSaving).toEqual({ _tag: "Idle" });
      expect(final.proposals).toEqual([]);
      expect(final.proposalDecisions).toEqual([]);
    },
  );

  it("removes both distinct decisions when V2 completes before V1 without regressing profile state", () => {
    const start: Model = {
      ...loadedWithProposals(),
      proposalDecisions: [
        { id: proposal.id, generation: 1, request: { _tag: "Pending" } },
        { id: structuredProposal.id, generation: 1, request: { _tag: "Pending" } },
      ],
    };
    const [afterV2] = update(
      start,
      Message.ProposalDecisionSucceeded({
        id: structuredProposal.id,
        generation: 1,
        response: {
          decision: "accepted",
          profile: { ...meResponse.profile, headline: "Accepted V2" },
          profileUpdatedAt: "2026-08-25T10:00:00.000Z",
        },
      }),
    );
    const [final] = update(
      afterV2,
      Message.ProposalDecisionSucceeded({
        id: proposal.id,
        generation: 1,
        response: {
          decision: "accepted",
          profile: { ...meResponse.profile, headline: "Accepted V1" },
          profileUpdatedAt: "2026-08-25T09:00:00.000Z",
        },
      }),
    );

    expect(final.proposals).toEqual([]);
    expect(final.proposalDecisions).toEqual([]);
    expect(final.profileUpdatedAt).toBe("2026-08-25T10:00:00.000Z");
    expect(final.profile).toMatchObject({
      _tag: "Success",
      data: { profile: { headline: "Accepted V2" } },
    });
    expect(Option.getOrThrow(final.profileForm).headline).toBe("Accepted V2");
    const [afterLateFailure] = update(
      final,
      Message.ProposalDecisionFailed({
        id: structuredProposal.id,
        generation: 1,
        problem: new NotFound({ message: "late failure" }),
      }),
    );
    expect(afterLateFailure).toBe(final);
  });

  it.each(["accepted", "discarded"] as const)(
    "preserves an unrelated dirty field through a %s decision and saves it against the newest revision",
    (decision) => {
      const [pending] = update(
        { ...loadedWithProposals(), proposals: [proposal] },
        Message.ProposalDecideClicked({ id: proposal.id, decision }),
      );
      const [edited] = update(pending, Message.SummaryChanged({ value: "Unsaved local summary" }));
      const persistedHeadline =
        decision === "accepted" ? "Persisted accepted headline" : meResponse.profile.headline;
      const [final] = update(
        edited,
        Message.ProposalDecisionSucceeded({
          id: proposal.id,
          generation: 1,
          response: {
            decision,
            profile: { ...meResponse.profile, headline: persistedHeadline },
            profileUpdatedAt: "2026-08-25T09:00:00.000Z",
          },
        }),
      );

      expect(final.proposals).toEqual([]);
      expect(final.proposalDecisions).toEqual([]);
      expect(final.profileUpdatedAt).toBe("2026-08-25T09:00:00.000Z");
      expect(final.profile).toMatchObject({
        _tag: "Success",
        data: { profile: { headline: persistedHeadline } },
      });
      expect(Option.getOrThrow(final.persistedProfileForm).headline).toBe(persistedHeadline);
      expect(Option.getOrThrow(final.profileForm)).toMatchObject({
        headline: meResponse.profile.headline,
        summary: "Unsaved local summary",
      });

      const [saving, commands] = update(final, Message.SaveClicked());
      expect(saving.profileSaving).toEqual({ _tag: "Pending" });
      expect(commands[0]?.args).toMatchObject({
        expectedUpdatedAt: "2026-08-25T09:00:00.000Z",
        profile: {
          headline: meResponse.profile.headline,
          summary: "Unsaved local summary",
        },
      });
    },
  );

  it("ignores stale save and decision failures without changing their owning requests", () => {
    const problem = new NotFound({ message: "stale" });
    const state: Model = {
      ...loadedWithProposals(),
      profileSaving: { _tag: "Pending" },
      saveGeneration: 2,
      proposalDecisions: [{ id: proposal.id, generation: 2, request: { _tag: "Pending" } }],
    };
    const [afterSave] = update(
      state,
      Message.SaveFailed({
        generation: 1,
        baseProfileUpdatedAt: meResponse.profileUpdatedAt,
        problem,
      }),
    );
    expect(afterSave).toBe(state);
    const [afterDecision] = update(
      state,
      Message.ProposalDecisionFailed({ id: proposal.id, generation: 1, problem }),
    );
    expect(afterDecision).toBe(state);
  });

  it("settles an owning save failure without regressing state when its base revision is stale", () => {
    const advancedResponse = responseAt("Accepted V2", "2026-08-25T10:00:00.000Z");
    const advanced: Model = {
      ...loadedWithProposals(),
      profile: { _tag: "Success", data: advancedResponse },
      profileUpdatedAt: advancedResponse.profileUpdatedAt,
      profileForm: Option.some({
        ...Option.getOrThrow(loadedWithProposals().profileForm),
        summary: "Unsaved local summary",
      }),
      profileSaving: { _tag: "Pending" },
      saveGeneration: 1,
    };
    const [final] = update(
      advanced,
      Message.SaveFailed({
        generation: 1,
        baseProfileUpdatedAt: meResponse.profileUpdatedAt,
        problem: new NotFound({ message: "stale failure" }),
      }),
    );

    expect(final.profileSaving).toEqual({ _tag: "Idle" });
    expect(final.profile).toBe(advanced.profile);
    expect(final.profileUpdatedAt).toBe("2026-08-25T10:00:00.000Z");
    expect(final.profileForm).toBe(advanced.profileForm);
    expect(final.proposals).toEqual(advanced.proposals);
  });

  it("prevents save and proposal decisions from starting across operations", () => {
    const decisionPending: Model = {
      ...loadedWithProposals(),
      proposalDecisions: [{ id: proposal.id, generation: 1, request: { _tag: "Pending" } }],
    };
    const [afterSave, saveCommands] = update(decisionPending, Message.SaveClicked());
    expect(afterSave).toBe(decisionPending);
    expect(saveCommands).toEqual([]);

    const savePending: Model = {
      ...loadedWithProposals(),
      profileSaving: { _tag: "Pending" },
      saveGeneration: 1,
    };
    const [afterDecision, decisionCommands] = update(
      savePending,
      Message.ProposalDecideClicked({ id: proposal.id, decision: "accepted" }),
    );
    expect(afterDecision).toBe(savePending);
    expect(decisionCommands).toEqual([]);
  });
});

describe("profile document file boundary", () => {
  it.each([
    ["application/pdf", "past-cv.pdf", MAX_PDF_PROFILE_FILE_BYTES],
    ["text/plain", "past-cv.txt", MAX_TEXT_PROFILE_FILE_BYTES],
  ])(
    "rejects an oversized %s selection before invoking either reader",
    async (mimeType, name, limit) => {
      const file = new File(["unused"], name, { type: mimeType });
      let dataUrlReads = 0;
      let textReads = 0;
      const problem = await Effect.runPromise(
        readProfileFile(file, {
          name: () => name,
          mimeType: () => mimeType,
          size: () => limit + 1,
          readAsDataUrl: () => {
            dataUrlReads += 1;
            return Effect.succeed("data:application/pdf;base64,unused");
          },
          readAsText: () => {
            textReads += 1;
            return Effect.succeed("unused");
          },
        }).pipe(Effect.flip),
      );

      expect(problem._tag).toBe("NetworkError");
      expect(dataUrlReads).toBe(0);
      expect(textReads).toBe(0);
    },
  );

  it("accepts 200,000 multibyte characters when their raw file stays within 800,000 bytes", async () => {
    const content = "é".repeat(MAX_TEXT_PROFILE_CHARACTERS);
    const file = new File([content], "multibyte.txt", { type: "text/plain" });
    const document = await Effect.runPromise(
      readProfileFile(file, {
        name: () => file.name,
        mimeType: () => file.type,
        size: () => file.size,
        readAsDataUrl: () => Effect.succeed(""),
        readAsText: () => Effect.succeed(content),
      }),
    );

    expect(file.size).toBe(MAX_TEXT_PROFILE_CHARACTERS * 2);
    expect(document).toEqual({ content, mimeType: "text/plain" });
  });

  it("rejects decoded plain text above 200,000 characters after one bounded read", async () => {
    const content = "x".repeat(MAX_TEXT_PROFILE_CHARACTERS + 1);
    const file = new File([content], "too-many-characters.txt", { type: "text/plain" });
    let textReads = 0;
    const problem = await Effect.runPromise(
      readProfileFile(file, {
        name: () => file.name,
        mimeType: () => file.type,
        size: () => file.size,
        readAsDataUrl: () => Effect.succeed(""),
        readAsText: () => {
          textReads += 1;
          return Effect.succeed(content);
        },
      }).pipe(Effect.flip),
    );

    expect(textReads).toBe(1);
    expect(problem).toMatchObject({
      _tag: "NetworkError",
      detail: "Plain-text files must be 200,000 characters or fewer.",
    });
  });
});
