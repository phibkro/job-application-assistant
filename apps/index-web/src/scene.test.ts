import { Option, Result } from "effect";
import {
  Command,
  click,
  expect,
  given,
  inside,
  label,
  role,
  scene,
  submit,
  text,
  type,
} from "foldkit/scene";
import { describe, test } from "vitest";
import { NavigateInternal } from "./command.ts";
import { Message, update, view } from "./main.ts";
import {
  bakerJob,
  bootedAt,
  developerJob,
  noFilter,
  pageOf,
  withJob,
  withList,
} from "./main.fixture.ts";
import { jobsQuery } from "./query.ts";
import { jobsRouter } from "./route.ts";

const osloFilter = { term: Option.none(), location: Option.some("Oslo") };

const listLoaded = withList(
  bootedAt("http://localhost/"),
  noFilter,
  Result.succeed(pageOf([bakerJob, developerJob])),
);

describe("list", () => {
  test("a pending list shows a loading status under the page heading", () => {
    scene(
      { update, view },
      given(bootedAt("http://localhost/")),
      expect(role("heading", { name: "Current vacancies", level: 1 })).toExist(),
      expect(text("Loading vacancies…")).toExist(),
    );
  });

  test("loaded vacancies are listed with links to their pages", () => {
    scene(
      { update, view },
      given(listLoaded),
      expect(text("2 vacancies")).toExist(),
      inside(
        role("list"),
        expect(role("link", { name: "Baker i Østfold" })).toHaveAttr("href", "/jobs/cj_1"),
        expect(text("Nordic Tech AS · Oslo")).toExist(),
      ),
      expect(role("button", { name: "Clear filters" })).toBeDisabled(),
    );
  });

  test("the filter form submits the typed text and location", () => {
    scene(
      { update, view },
      given(listLoaded),
      type(label("Text"), "utvikler"),
      type(label("Location"), "Oslo"),
      submit(role("search")),
      Command.expectExact(
        NavigateInternal({
          url: jobsRouter({ term: Option.some("utvikler"), location: Option.some("Oslo") }),
        }),
      ),
      Command.resolve(NavigateInternal, Message.CompletedNavigateInternal()),
    );
  });

  test("a URL with filters fills the form, and clearing returns to the bare list", () => {
    scene(
      { update, view },
      given(
        withList(
          bootedAt("http://localhost/?location=Oslo"),
          osloFilter,
          Result.succeed(pageOf([developerJob])),
        ),
      ),
      expect(label("Location")).toHaveValue("Oslo"),
      expect(text("1 vacancy")).toExist(),
      click(role("button", { name: "Clear filters" })),
      Command.expectExact(NavigateInternal({ url: "/" })),
      Command.resolve(NavigateInternal, Message.CompletedNavigateInternal()),
    );
  });

  test("an empty result says so", () => {
    const filter = { term: Option.some("astronaut"), location: Option.none() };
    scene(
      { update, view },
      given(
        withList(bootedAt("http://localhost/?term=astronaut"), filter, Result.succeed(pageOf([]))),
      ),
      expect(text("No current vacancies match these filters.")).toExist(),
    );
  });

  test("a failed load shows an alert whose retry reloads the list", () => {
    scene(
      { update, view },
      given(
        withList(
          bootedAt("http://localhost/"),
          noFilter,
          Result.fail("The vacancy list could not be loaded."),
        ),
      ),
      inside(
        role("alert"),
        expect(text("The vacancy list could not be loaded.")).toExist(),
        click(role("button", { name: "Retry" })),
      ),
      Command.resolve(
        jobsQuery.Fetch,
        jobsQuery.Message.CompletedFetch({
          args: noFilter,
          generation: 2,
          result: Result.succeed(pageOf([bakerJob])),
        }),
      ),
      expect(text("1 vacancy")).toExist(),
    );
  });
});

describe("detail", () => {
  test("a pending vacancy keeps one page heading and a loading status", () => {
    scene(
      { update, view },
      given(bootedAt("http://localhost/jobs/cj_2")),
      expect(role("heading", { name: "Vacancy", level: 1 })).toExist(),
      expect(text("Loading the vacancy…")).toExist(),
    );
  });

  test("shows the vacancy's facts and its source reference", () => {
    scene(
      { update, view },
      given(withJob(bootedAt("http://localhost/jobs/cj_2"), "cj_2", Result.succeed(developerJob))),
      expect(role("heading", { name: "Frontendutvikler", level: 1 })).toExist(),
      expect(text("2026-09-01")).toExist(),
      inside(
        role("region", { name: "Source" }),
        expect(text("Reported by: nav")).toExist(),
        expect(role("link", { name: "Open the original listing" })).toHaveAttr(
          "href",
          "https://example.com/job/2",
        ),
      ),
      expect(role("link", { name: "Back to vacancies" })).toHaveAttr("href", "/"),
    );
  });

  test("a missing vacancy shows the reason", () => {
    scene(
      { update, view },
      given(
        withJob(
          bootedAt("http://localhost/jobs/cj_missing"),
          "cj_missing",
          Result.fail("No vacancy has this id."),
        ),
      ),
      expect(role("heading", { name: "Vacancy", level: 1 })).toExist(),
      inside(role("alert"), expect(text("No vacancy has this id.")).toExist()),
    );
  });
});

test("an unknown path renders the not-found page", () => {
  scene(
    { update, view },
    given(bootedAt("http://localhost/nowhere")),
    expect(role("heading", { name: "Page not found", level: 1 })).toExist(),
    expect(role("link", { name: "Browse current vacancies" })).toHaveAttr("href", "/"),
  );
});
