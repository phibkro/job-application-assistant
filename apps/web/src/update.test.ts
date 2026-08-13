import * as Option from "effect/Option";
import * as S from "effect/Schema";
import { describe, expect, it } from "vitest";
import * as SavedMessage from "./saved/Message.ts";
import { Navigation, Url } from "foldkit";
import { CanonicalJob } from "@job-index/domain/Job";
import {
  BrowseJobsFailed,
  BrowseJobsSucceeded,
  BrowseNextPageRequested,
  BrowseSearchSubmitted,
  BrowseTermChanged,
  DecisionRequested,
  DecisionSucceeded,
  DraftSucceeded,
  FeedDismissSucceeded,
  FeedSucceeded,
  GotSavedMessage,
  PrepareSucceeded,
  SaveJobClicked,
  SaveJobSucceeded,
  SessionCleared,
  SessionTokenInputChanged,
  SessionTokenSubmitted,
  StorageSynced,
  UrlChanged,
  UrlRequested,
} from "./Message.ts";
import { NotFound, initialModel, PageNotFound, PageSaved } from "./Model.ts";
import type { Model } from "./Model.ts";
import {
  RouteBrowse,
  RouteFeed,
  RouteJobDetail,
  RouteNotFound,
  RouteProfile,
  RouteSaved,
} from "./Route.ts";
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
  applicationUrl: "https://example.com/jobs/1",
  publishedAt: "2026-01-01T00:00:00Z",
  status: { _tag: "Active" as const },
  sequence: 1,
  changedAt: "2026-01-01T00:00:00Z",
  sources: [],
  hydration: { _tag: "Hydrated" as const, description: "Build things." },
});

const page = { data: [job], meta: { limit: 20, nextCursor: null as string | null } };
const assessment = {
  fit: "strong" as const,
  score: 3,
  reasons: [
    {
      kind: "role" as const,
      profileValue: "Engineer",
      jobField: "title" as const,
      jobValue: "Software Engineer",
    },
  ],
  concerns: [],
};
const matchPage = {
  data: [{ job, assessment }],
  meta: { limit: 20, nextCursor: null as null },
};

describe("UrlChanged", () => {
  it("triggers exactly one FetchJobs Command the first time Browse loads", () => {
    const [model, commands] = update(
      initialModel,
      UrlChanged({ route: RouteBrowse({ term: "", location: "", status: "" }) }),
    );
    expect(model.page._tag).toBe("Browse");
    expect(model.browseResults._tag).toBe("Loading");
    expect(commands.map((c) => c.name)).toEqual(["FetchJobs"]);
  });

  it("does not refetch a page that already has data", () => {
    const loaded: Model = { ...initialModel, browseResults: { _tag: "Success", data: page } };
    const [model, commands] = update(
      loaded,
      UrlChanged({ route: RouteBrowse({ term: "", location: "", status: "" }) }),
    );
    expect(model.browseResults).toEqual(loaded.browseResults);
    expect(commands).toEqual([]);
  });

  it("carries the route's query into browseQuery, so a deep search link loads filtered", () => {
    const [model, commands] = update(
      initialModel,
      UrlChanged({ route: RouteBrowse({ term: "engineer", location: "Oslo", status: "" }) }),
    );
    expect(model.browseQuery).toEqual({ term: "engineer", location: "Oslo", status: "" });
    expect(commands[0]?.args).toMatchObject({ term: "engineer", location: "Oslo" });
  });

  // The case that has to be got right: nothing upstream necessarily fetched
  // this job, so a deep link cannot lean on `ensureLoaded`'s "already have
  // it" guard the way every other route here does.
  it("a deep link straight to JobDetail loads that job, not assuming a prior screen already did", () => {
    const [model, commands] = update(
      initialModel,
      UrlChanged({ route: RouteJobDetail({ jobId: "job-2" }) }),
    );
    expect(model.page).toEqual({ _tag: "JobDetail", jobId: "job-2" });
    expect(model.publicJobDetail._tag).toBe("Loading");
    expect(commands.map((c) => c.name)).toEqual(["FetchPublicJob"]);
    expect(commands[0]?.args).toMatchObject({ jobId: "job-2" });
  });

  it("uses the authenticated match endpoint for signed-in detail", () => {
    const [model, commands] = update(
      {
        ...initialModel,
        session: { _tag: "Authenticated", token: "demo-token" },
      },
      UrlChanged({ route: RouteJobDetail({ jobId: "job-2" }) }),
    );
    expect(model.matchDetail._tag).toBe("Loading");
    expect(commands.map((command) => command.name)).toEqual(["FetchMatchDetail"]);
  });

  it("always refetches the job on JobDetail navigation, keyed by the new id", () => {
    const atJobOne: Model = {
      ...initialModel,
      page: { _tag: "JobDetail", jobId: "job-1" },
      publicJobDetail: { _tag: "Success", data: job },
    };
    const [model, commands] = update(
      atJobOne,
      UrlChanged({ route: RouteJobDetail({ jobId: "job-2" }) }),
    );
    expect(model.page).toEqual({ _tag: "JobDetail", jobId: "job-2" });
    expect(model.publicJobDetail._tag).toBe("Loading");
    expect(commands.map((c) => c.name)).toEqual(["FetchPublicJob"]);
  });

  it("routes into Profile and asks the Submodel to load, going through its own boundary", () => {
    const [model, commands] = update(initialModel, UrlChanged({ route: RouteProfile() }));
    expect(model.page).toEqual({ _tag: "Profile" });
    expect(model.profile.profile._tag).toBe("Loading");
    expect(commands.map((c) => c.name)).toEqual(["FetchProfile"]);
  });

  it("loads Saved only for an authenticated owner", () => {
    const [anonymous, anonymousCommands] = update(
      initialModel,
      UrlChanged({ route: RouteSaved() }),
    );
    expect(anonymous.page).toEqual(PageSaved());
    expect(anonymousCommands).toEqual([]);

    const [authenticated, commands] = update(
      { ...initialModel, session: { _tag: "Authenticated", token: "secret" } },
      UrlChanged({ route: RouteSaved() }),
    );
    expect(authenticated.saved.saved._tag).toBe("Loading");
    expect(authenticated.saved.labels._tag).toBe("Loading");
    expect(commands.map((command) => command.name)).toEqual(["FetchSaved", "FetchSavedLabels"]);
  });

  it("an unmatched path becomes PageNotFound, not a silent fallback to Browse", () => {
    const [model, commands] = update(
      initialModel,
      UrlChanged({ route: RouteNotFound({ path: "/nope" }) }),
    );
    expect(model.page).toEqual(PageNotFound({ path: "/nope" }));
    expect(commands).toEqual([]);
  });
});

describe("UrlRequested", () => {
  const internalUrl = Option.getOrThrow(Url.fromString("https://job-index.example/jobs/job-9"));

  it("an internal request pushes the URL rather than touching the Model", () => {
    const [model, commands] = update(
      initialModel,
      UrlRequested({ request: Navigation.Internal({ url: internalUrl }) }),
    );
    expect(model).toBe(initialModel);
    expect(commands.map((c) => c.name)).toEqual(["PushUrl"]);
    expect(commands[0]?.args).toMatchObject({ href: "https://job-index.example/jobs/job-9" });
  });

  it("an external request loads it as a full navigation", () => {
    const [model, commands] = update(
      initialModel,
      UrlRequested({ request: Navigation.External({ href: "https://elsewhere.example/apply" }) }),
    );
    expect(model).toBe(initialModel);
    expect(commands.map((c) => c.name)).toEqual(["LoadUrl"]);
    expect(commands[0]?.args).toMatchObject({ href: "https://elsewhere.example/apply" });
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

  it("a submitted search pushes the address bar alongside the fetch, so it can be shared", () => {
    const withTerm: Model = {
      ...initialModel,
      browseQuery: { term: "engineer", location: "", status: "Active" },
    };
    const [, commands] = update(withTerm, BrowseSearchSubmitted());
    expect(commands.map((c) => c.name)).toEqual(["FetchJobs", "PushUrl"]);
    expect(commands[1]?.args).toMatchObject({ href: "/?term=engineer&status=Active" });
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

  it("waits for session persistence before loading Saved", () => {
    const onSaved: Model = {
      ...initialModel,
      page: PageSaved(),
      sessionTokenInput: "secret",
    };
    const [authenticated, persistCommands] = update(onSaved, SessionTokenSubmitted());
    expect(persistCommands.map((command) => command.name)).toEqual(["PersistSessionToken"]);

    const [loading, savedCommands] = update(
      authenticated,
      StorageSynced({ sessionEpoch: authenticated.sessionEpoch }),
    );
    expect(loading.saved.saved._tag).toBe("Loading");
    expect(savedCommands.map((command) => command.name)).toEqual([
      "FetchSaved",
      "FetchSavedLabels",
    ]);
  });

  it("ignores a Saved response from an earlier authenticated owner", () => {
    const [ownerA] = update(
      { ...initialModel, page: PageSaved(), sessionTokenInput: "owner-a" },
      SessionTokenSubmitted(),
    );
    const [ownerALoading] = update(ownerA, StorageSynced({ sessionEpoch: ownerA.sessionEpoch }));
    const [signedOut] = update(ownerALoading, SessionCleared());
    const [ownerB] = update(
      { ...signedOut, sessionTokenInput: "owner-b" },
      SessionTokenSubmitted(),
    );
    const [ownerBLoading] = update(ownerB, StorageSynced({ sessionEpoch: ownerB.sessionEpoch }));

    const [afterLateResponse, commands] = update(
      ownerBLoading,
      GotSavedMessage({
        sessionEpoch: ownerA.sessionEpoch,
        message: SavedMessage.FetchFailed({
          problem: new NotFound({ message: "owner A response" }),
          append: false,
        }),
      }),
    );

    expect(afterLateResponse).toBe(ownerBLoading);
    expect(afterLateResponse.saved.saved._tag).toBe("Loading");
    expect(commands).toEqual([]);
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
    expect(model.saved).toEqual(initialModel.saved);
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
    const loaded: Model = {
      ...initialModel,
      feedResults: { _tag: "Success", data: matchPage },
    };
    const [model, commands] = update(loaded, FeedDismissSucceeded({ jobId: "job-1" }));
    expect(model.feedResults).toEqual({
      _tag: "Success",
      data: { ...matchPage, data: [] },
    });
    expect(commands).toEqual([]);
  });

  it("does not refetch the feed once it has loaded", () => {
    const loaded: Model = {
      ...initialModel,
      feedResults: { _tag: "Success", data: matchPage },
    };
    const [, commands] = update(loaded, UrlChanged({ route: RouteFeed() }));
    expect(commands).toEqual([]);
  });

  it("FeedSucceeded on first load populates the feed", () => {
    const [model] = update(initialModel, FeedSucceeded({ page: matchPage }));
    expect(model.feedResults).toEqual({ _tag: "Success", data: matchPage });
  });
});
