import { Option, Result } from "effect";
import { Command, given, message, model, story } from "foldkit/story";
import { describe, expect, test } from "vitest";
import { NavigateInternal } from "./command.ts";
import { Message, init, update } from "./main.ts";
import {
  bakerJob,
  blankModel,
  developerJob,
  noFilter,
  pageOf,
  urlOrThrow,
} from "./main.fixture.ts";
import { jobQuery, jobsQuery } from "./query.ts";
import { AppRoute, jobRouter, jobsRouter } from "./route.ts";

const visit = (raw: string) => message(Message.ChangedUrl({ url: urlOrThrow(raw) }));

const FIRST_GENERATION = 1;
const SECOND_GENERATION = 2;

const resolveUnfilteredList = Command.resolve(
  jobsQuery.Fetch,
  jobsQuery.Message.CompletedFetch({
    args: noFilter,
    generation: FIRST_GENERATION,
    result: Result.succeed(pageOf([bakerJob, developerJob])),
  }),
);

const osloFilter = { term: Option.some("utvikler"), location: Option.some("Oslo") };

describe("init", () => {
  test("booting on the list fetches current vacancies for the URL's filters", () => {
    const booted = init(urlOrThrow("http://localhost/?term=utvikler&location=Oslo"));
    expect(booted.model.route).toStrictEqual(AppRoute.Jobs(osloFilter));
    expect(booted.model.termInput).toBe("utvikler");
    expect(booted.model.locationInput).toBe("Oslo");
    expect(jobsQuery.read(booted.model.jobs, osloFilter)._tag).toBe("Loading");
  });

  test("an unknown path renders NotFound and fetches nothing", () => {
    const booted = init(urlOrThrow("http://localhost/nowhere/at/all"));
    expect(booted.model.route._tag).toBe("NotFound");
    expect(booted.commands).toBeUndefined();
  });
});

describe("filters", () => {
  test("submitting pushes a URL holding the trimmed filters; blank fields are dropped", () => {
    story(
      update,
      given(blankModel),
      visit("http://localhost/"),
      resolveUnfilteredList,
      message(Message.UpdatedTermInput({ value: "  utvikler " })),
      message(Message.UpdatedLocationInput({ value: "   " })),
      message(Message.SubmittedFilters()),
      Command.expectExact(
        NavigateInternal({
          url: jobsRouter({ term: Option.some("utvikler"), location: Option.none() }),
        }),
      ),
      Command.resolve(NavigateInternal, Message.CompletedNavigateInternal()),
    );
  });

  test("the URL change loads the filtered list, and the result renders from the cache", () => {
    story(
      update,
      given(blankModel),
      visit("http://localhost/"),
      Command.resolve(
        jobsQuery.Fetch,
        jobsQuery.Message.CompletedFetch({
          args: noFilter,
          generation: FIRST_GENERATION,
          result: Result.succeed(pageOf([bakerJob, developerJob])),
        }),
      ),
      message(
        Message.ChangedUrl({ url: urlOrThrow("http://localhost/?term=utvikler&location=Oslo") }),
      ),
      model((current) => {
        expect(jobsQuery.read(current.jobs, osloFilter)._tag).toBe("Loading");
        expect(jobsQuery.read(current.jobs, noFilter)._tag).toBe("Success");
      }),
      Command.resolve(
        jobsQuery.Fetch,
        jobsQuery.Message.CompletedFetch({
          args: osloFilter,
          generation: SECOND_GENERATION,
          result: Result.succeed(pageOf([developerJob])),
        }),
      ),
      model((current) => {
        expect(jobsQuery.read(current.jobs, osloFilter)._tag).toBe("Success");
      }),
      // Back to the unfiltered list: served from the cache, no refetch.
      message(Message.ChangedUrl({ url: urlOrThrow("http://localhost/") })),
      Command.expectNone(),
      model((current) => {
        expect(current.termInput).toBe("");
        expect(current.locationInput).toBe("");
      }),
    );
  });

  test("clearing filters navigates to the unfiltered list", () => {
    story(
      update,
      given(blankModel),
      visit("http://localhost/?term=baker"),
      Command.resolve(
        jobsQuery.Fetch,
        jobsQuery.Message.CompletedFetch({
          args: { term: Option.some("baker"), location: Option.none() },
          generation: FIRST_GENERATION,
          result: Result.succeed(pageOf([bakerJob])),
        }),
      ),
      message(Message.ClickedClearFilters()),
      Command.expectExact(NavigateInternal({ url: jobsRouter(noFilter) })),
      Command.resolve(NavigateInternal, Message.CompletedNavigateInternal()),
    );
  });

  test("a failed list fetch can be retried", () => {
    story(
      update,
      given(blankModel),
      visit("http://localhost/"),
      Command.resolve(
        jobsQuery.Fetch,
        jobsQuery.Message.CompletedFetch({
          args: noFilter,
          generation: FIRST_GENERATION,
          result: Result.fail("The vacancy list could not be loaded."),
        }),
      ),
      model((current) => {
        expect(jobsQuery.read(current.jobs, noFilter)._tag).toBe("Failure");
      }),
      message(Message.ClickedRetryJobs()),
      model((current) => {
        expect(jobsQuery.read(current.jobs, noFilter)._tag).toBe("Loading");
      }),
      Command.resolve(
        jobsQuery.Fetch,
        jobsQuery.Message.CompletedFetch({
          args: noFilter,
          generation: SECOND_GENERATION,
          result: Result.succeed(pageOf([bakerJob])),
        }),
      ),
      model((current) => {
        expect(jobsQuery.read(current.jobs, noFilter)._tag).toBe("Success");
      }),
    );
  });
});

describe("detail", () => {
  test("opening a vacancy fetches it by id and keeps the list query for the back link", () => {
    story(
      update,
      given(blankModel),
      visit("http://localhost/?location=Oslo"),
      Command.resolve(
        jobsQuery.Fetch,
        jobsQuery.Message.CompletedFetch({
          args: { term: Option.none(), location: Option.some("Oslo") },
          generation: FIRST_GENERATION,
          result: Result.succeed(pageOf([developerJob])),
        }),
      ),
      message(
        Message.ChangedUrl({ url: urlOrThrow(`http://localhost${jobRouter({ jobId: "cj_2" })}`) }),
      ),
      model((current) => {
        expect(current.route).toStrictEqual(AppRoute.Job({ jobId: "cj_2" }));
        expect(current.lastJobsQuery.location).toStrictEqual(Option.some("Oslo"));
        expect(jobQuery.read(current.job, { jobId: "cj_2" })._tag).toBe("Loading");
      }),
      Command.resolve(
        jobQuery.Fetch,
        jobQuery.Message.CompletedFetch({
          args: { jobId: "cj_2" },
          generation: FIRST_GENERATION,
          result: Result.succeed(developerJob),
        }),
      ),
      model((current) => {
        expect(jobQuery.read(current.job, { jobId: "cj_2" })._tag).toBe("Success");
      }),
    );
  });

  test("a missing vacancy fails with the server's reason and can be retried", () => {
    story(
      update,
      given(blankModel),
      visit("http://localhost/jobs/cj_missing"),
      Command.resolve(
        jobQuery.Fetch,
        jobQuery.Message.CompletedFetch({
          args: { jobId: "cj_missing" },
          generation: FIRST_GENERATION,
          result: Result.fail("No vacancy has this id."),
        }),
      ),
      message(Message.ClickedRetryJob({ jobId: "cj_missing" })),
      model((current) => {
        expect(jobQuery.read(current.job, { jobId: "cj_missing" })._tag).toBe("Loading");
      }),
      Command.resolve(
        jobQuery.Fetch,
        jobQuery.Message.CompletedFetch({
          args: { jobId: "cj_missing" },
          generation: SECOND_GENERATION,
          result: Result.fail("No vacancy has this id."),
        }),
      ),
    );
  });
});
