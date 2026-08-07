import * as Option from "effect/Option";
import * as S from "effect/Schema";
import { describe, expect, it } from "vitest";
import { CanonicalJob } from "@job-index/domain/Job";
import {
  BrowseJobsFailed,
  BrowseJobsSucceeded,
  BrowseNextPageRequested,
  BrowseTermChanged,
  DecisionRequested,
  DecisionSucceeded,
  DraftSucceeded,
  FeedDismissSucceeded,
  FeedSucceeded,
  Navigated,
  PrepareSucceeded,
  SaveJobClicked,
  SaveJobSucceeded,
  SessionCleared,
  SessionTokenInputChanged,
  SessionTokenSubmitted,
} from "./Message.ts";
import { NotFound, initialModel, PageBrowse, PageFeed, PageJobDetail } from "./Model.ts";
import type { Model } from "./Model.ts";
import { update } from "./update.ts";

/**
 * `update` is a pure function: a Message in, a Model out, and the Commands
 * it decided to run. These tests never resolve a Command's Effect — that
 * would be testing the network, not the decision — they only check what
 * `update` decided given the Model it was handed, which is exactly the
 * "message in, model out" contract this module promises.
 */

// Decoded, not asserted: `id` and `sources` are branded (`CanonicalJobId`,
// `SourceId`), and decoding through the real domain Schema is what actually
// proves this fixture is a value the contract could have sent — a type
// assertion would only prove the compiler stopped looking.
const job = S.decodeUnknownSync(CanonicalJob)({
  id: "job-1",
  title: "Software Engineer",
  employerName: "Acme",
  location: "Oslo",
  description: "Build things.",
  applicationUrl: "https://example.com/jobs/1",
  publishedAt: "2026-01-01T00:00:00Z",
  status: { _tag: "Active" as const },
  sequence: 1,
  changedAt: "2026-01-01T00:00:00Z",
  sources: [],
});

const page = { data: [job], meta: { limit: 20, nextCursor: null as string | null } };

describe("Navigated", () => {
  it("triggers exactly one FetchJobs Command the first time Browse loads", () => {
    const [model, commands] = update(initialModel, Navigated({ to: PageBrowse() }));
    expect(model.page._tag).toBe("Browse");
    expect(model.browseResults._tag).toBe("Loading");
    expect(commands.map((c) => c.name)).toEqual(["FetchJobs"]);
  });

  it("does not refetch a page that already has data", () => {
    const loaded: Model = { ...initialModel, browseResults: { _tag: "Success", data: page } };
    const [model, commands] = update(loaded, Navigated({ to: PageBrowse() }));
    expect(model.browseResults).toEqual(loaded.browseResults);
    expect(commands).toEqual([]);
  });

  it("always refetches the job on JobDetail navigation, keyed by the new id", () => {
    const [model, commands] = update(
      initialModel,
      Navigated({ to: PageJobDetail({ jobId: "job-2" }) }),
    );
    expect(model.page).toEqual({ _tag: "JobDetail", jobId: "job-2" });
    expect(model.jobDetail._tag).toBe("Loading");
    expect(commands.map((c) => c.name)).toEqual(["FetchJob"]);
  });
});

describe("Browse", () => {
  it("updates the query field without touching results", () => {
    const [model] = update(initialModel, BrowseTermChanged({ value: "engineer" }));
    expect(model.browseQuery).toEqual({ term: "engineer", location: "", status: "" });
    expect(model.browseResults._tag).toBe("Idle");
  });

  it("BrowseJobsSucceeded replaces Loading with Success", () => {
    const loading: Model = { ...initialModel, browseResults: { _tag: "Loading" } };
    const [model] = update(loading, BrowseJobsSucceeded({ page }));
    expect(model.browseResults).toEqual({ _tag: "Success", data: page });
  });

  it("BrowseJobsFailed after Loading becomes a bare Failure", () => {
    const loading: Model = { ...initialModel, browseResults: { _tag: "Loading" } };
    const [model] = update(loading, BrowseJobsFailed({ problem: new NotFound({ message: "no" }) }));
    expect(model.browseResults._tag).toBe("Failure");
  });

  it("BrowseJobsFailed after a Refreshing keeps the stale data on screen", () => {
    const refreshing: Model = {
      ...initialModel,
      browseResults: { _tag: "Refreshing", data: page },
    };
    const [model] = update(
      refreshing,
      BrowseJobsFailed({ problem: new NotFound({ message: "no" }) }),
    );
    expect(model.browseResults).toMatchObject({ _tag: "Stale", data: page });
  });

  it("does not page past the end when nextCursor is null", () => {
    const loaded: Model = { ...initialModel, browseResults: { _tag: "Success", data: page } };
    const [model, commands] = update(loaded, BrowseNextPageRequested());
    expect(model).toBe(loaded);
    expect(commands).toEqual([]);
  });

  it("pages forward with the cursor from the current page", () => {
    const withCursor = { ...page, meta: { limit: 20, nextCursor: "cursor-2" } };
    const loaded: Model = { ...initialModel, browseResults: { _tag: "Success", data: withCursor } };
    const [model, commands] = update(loaded, BrowseNextPageRequested());
    expect(model.browseResults).toEqual({ _tag: "Refreshing", data: withCursor });
    expect(commands.map((c) => c.name)).toEqual(["FetchJobs"]);
    expect(commands[0]?.args).toMatchObject({ cursor: Option.some("cursor-2") });
  });
});

describe("session", () => {
  it("SessionTokenSubmitted with an empty box is a no-op", () => {
    const [model, commands] = update(initialModel, SessionTokenSubmitted());
    expect(model).toBe(initialModel);
    expect(commands).toEqual([]);
  });

  it("SessionTokenSubmitted with text authenticates and persists it", () => {
    const withInput = { ...initialModel, sessionTokenInput: "  secret-key  " };
    const [model, commands] = update(withInput, SessionTokenSubmitted());
    expect(model.session).toEqual({ _tag: "Authenticated", token: "secret-key" });
    expect(commands.map((c) => c.name)).toEqual(["PersistSessionToken"]);
  });

  it("SessionCleared resets the profile Submodel to its own init, not a hand-picked shape", () => {
    const signedIn: Model = {
      ...initialModel,
      session: { _tag: "Authenticated", token: "secret" },
      profile: {
        ...initialModel.profile,
        profile: {
          _tag: "Success",
          data: { profile: { headline: "x" } as never, capabilities: [] },
        },
      },
      applications: [{ jobId: "job-1", stage: Option.none(), pending: { _tag: "Idle" } }],
    };
    const [model, commands] = update(signedIn, SessionCleared());
    expect(model.session).toEqual({ _tag: "Anonymous" });
    expect(model.profile).toEqual(initialModel.profile);
    expect(model.applications).toEqual([]);
    expect(commands.map((c) => c.name)).toEqual(["ClearSessionToken"]);
  });

  it("typing into the token box only updates the box", () => {
    const [model] = update(initialModel, SessionTokenInputChanged({ value: "abc" }));
    expect(model.sessionTokenInput).toBe("abc");
    expect(model.session).toEqual({ _tag: "Anonymous" });
  });
});

describe("apply loop", () => {
  it("SaveJobClicked marks the job Pending and asks the server to save it", () => {
    const [model, commands] = update(initialModel, SaveJobClicked({ jobId: "job-1" }));
    expect(model.applications).toEqual([
      { jobId: "job-1", stage: Option.none(), pending: { _tag: "Pending" } },
    ]);
    expect(commands.map((c) => c.name)).toEqual(["SaveJob"]);
  });

  it("SaveJobSucceeded advances the record to Saved and clears pending", () => {
    const pending: Model = {
      ...initialModel,
      applications: [{ jobId: "job-1", stage: Option.none(), pending: { _tag: "Pending" } }],
    };
    const [model] = update(pending, SaveJobSucceeded({ jobId: "job-1", savedJobId: "saved-1" }));
    expect(model.applications).toEqual([
      {
        jobId: "job-1",
        stage: Option.some({ _tag: "Saved", savedJobId: "saved-1", note: Option.none() }),
        pending: { _tag: "Idle" },
      },
    ]);
  });

  it("carries a Prepared application's identity forward into Decided, keyed by the decision made", () => {
    const prepared: Model = {
      ...initialModel,
      applications: [
        {
          jobId: "job-1",
          stage: Option.some({
            _tag: "Prepared",
            savedJobId: "saved-1",
            applicationId: "app-1",
            method: "assisted",
            applicationUrl: "https://example.com/apply",
            cv: "cv text",
            letter: "letter text",
            downgradeReason: "LinkedIn forbids automated submission",
          }),
          pending: { _tag: "Idle" },
        },
      ],
    };

    const [afterRequest, commands] = update(
      prepared,
      DecisionRequested({ jobId: "job-1", applicationId: "app-1", decision: "Approve" }),
    );
    expect(afterRequest.applications[0]?.pending).toEqual({ _tag: "Pending" });
    expect(commands.map((c) => c.name)).toEqual(["DecideApplication"]);
    // `decision` travels through untouched — the wire string is chosen at the
    // Command boundary, not here.
    expect(commands[0]?.args).toMatchObject({ decision: "Approve" });

    const [model] = update(
      afterRequest,
      DecisionSucceeded({ jobId: "job-1", applicationId: "app-1", status: "approved" }),
    );
    expect(model.applications).toEqual([
      {
        jobId: "job-1",
        stage: Option.some({
          _tag: "Decided",
          savedJobId: "saved-1",
          applicationId: "app-1",
          method: "assisted",
          applicationUrl: "https://example.com/apply",
          cv: "cv text",
          letter: "letter text",
          downgradeReason: "LinkedIn forbids automated submission",
          status: "approved",
        }),
        pending: { _tag: "Idle" },
      },
    ]);
  });

  it("DraftSucceeded for one job never touches another job's record", () => {
    const twoJobs: Model = {
      ...initialModel,
      applications: [
        {
          jobId: "job-1",
          stage: Option.some({
            _tag: "Saved" as const,
            savedJobId: "saved-1",
            note: Option.none(),
          }),
          pending: { _tag: "Pending" },
        },
        {
          jobId: "job-2",
          stage: Option.some({
            _tag: "Saved" as const,
            savedJobId: "saved-2",
            note: Option.none(),
          }),
          pending: { _tag: "Idle" },
        },
      ],
    };
    const [model] = update(
      twoJobs,
      DraftSucceeded({
        jobId: "job-1",
        savedJobId: "saved-1",
        cv: "cv",
        letter: "letter",
        generator: "template",
      }),
    );
    expect(model.applications[1]).toEqual(twoJobs.applications[1]);
    expect(model.applications[0]?.stage).toEqual(
      Option.some({
        _tag: "Drafted",
        savedJobId: "saved-1",
        cv: "cv",
        letter: "letter",
        generator: "template",
      }),
    );
  });

  it("a downgraded PrepareSucceeded keeps the reason in the Model for the view to show", () => {
    const drafted: Model = {
      ...initialModel,
      applications: [
        {
          jobId: "job-1",
          stage: Option.some({
            _tag: "Drafted" as const,
            savedJobId: "saved-1",
            cv: "cv",
            letter: "letter",
            generator: "template",
          }),
          pending: { _tag: "Pending" },
        },
      ],
    };
    const [model] = update(
      drafted,
      PrepareSucceeded({
        jobId: "job-1",
        savedJobId: "saved-1",
        applicationId: "app-1",
        method: "assisted",
        applicationUrl: "https://example.com/apply",
        cv: "cv",
        letter: "letter",
        downgradeReason: "Automated submission is not permitted on this platform",
      }),
    );
    const stage = model.applications[0]?.stage;
    expect(
      Option.isSome(stage) && stage.value._tag === "Prepared" ? stage.value.downgradeReason : null,
    ).toBe("Automated submission is not permitted on this platform");
  });
});

describe("feed", () => {
  it("dismissing a job removes it from the visible page without refetching", () => {
    const loaded: Model = { ...initialModel, feedResults: { _tag: "Success", data: page } };
    const [model, commands] = update(loaded, FeedDismissSucceeded({ jobId: "job-1" }));
    expect(model.feedResults).toEqual({ _tag: "Success", data: { ...page, data: [] } });
    expect(commands).toEqual([]);
  });

  it("does not refetch the feed once it has loaded", () => {
    const loaded: Model = { ...initialModel, feedResults: { _tag: "Success", data: page } };
    const [, commands] = update(loaded, Navigated({ to: PageFeed() }));
    expect(commands).toEqual([]);
  });

  it("FeedSucceeded on first load populates the feed", () => {
    const [model] = update(initialModel, FeedSucceeded({ page }));
    expect(model.feedResults).toEqual({ _tag: "Success", data: page });
  });
});
