import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import { Url } from "foldkit";
import { RouteBrowse, RouteFeed, RouteJobDetail, RouteProfile, href, parse } from "./Route.ts";

const url = (pathAndQuery: string) =>
  Option.getOrThrow(Url.fromString(`https://job-index.example${pathAndQuery}`));

describe("parse", () => {
  it("parses the root path as Browse with empty filters when there is no query string", () => {
    expect(parse(url("/"))).toEqual(RouteBrowse({ term: "", location: "", status: "" }));
  });

  it("parses Browse's query string into its filters", () => {
    expect(parse(url("/?term=engineer&location=Oslo&status=Active"))).toEqual(
      RouteBrowse({ term: "engineer", location: "Oslo", status: "Active" }),
    );
  });

  it("defaults a filter missing from the query string to empty, not a parse failure", () => {
    expect(parse(url("/?term=engineer"))).toEqual(
      RouteBrowse({ term: "engineer", location: "", status: "" }),
    );
  });

  it("parses a job id out of /jobs/:id", () => {
    expect(parse(url("/jobs/job-9"))).toEqual(RouteJobDetail({ jobId: "job-9" }));
  });

  it("parses /feed and /profile", () => {
    expect(parse(url("/feed"))).toEqual(RouteFeed());
    expect(parse(url("/profile"))).toEqual(RouteProfile());
  });

  it("falls back to NotFound for a path no route matches, carrying the path", () => {
    const route = parse(url("/nope"));
    expect(route).toEqual({ _tag: "NotFound", path: "/nope" });
  });

  // `/jobs` alone (no id) matching JobDetail would be a route this app
  // cannot build a link for — `string('jobId')` requires the segment, so
  // this has to fail through to NotFound rather than half-match.
  it("does not treat a bare /jobs prefix as a JobDetail match", () => {
    const route = parse(url("/jobs"));
    expect(route._tag).toBe("NotFound");
  });
});

describe("href", () => {
  it("round-trips Browse with its filters through the query string", () => {
    const route = RouteBrowse({ term: "engineer", location: "Oslo", status: "" });
    expect(parse(url(href(route)))).toEqual(route);
  });

  it("round-trips JobDetail, Feed, and Profile", () => {
    expect(parse(url(href(RouteJobDetail({ jobId: "job-9" }))))).toEqual(
      RouteJobDetail({ jobId: "job-9" }),
    );
    expect(parse(url(href(RouteFeed())))).toEqual(RouteFeed());
    expect(parse(url(href(RouteProfile())))).toEqual(RouteProfile());
  });

  it("builds a bare / for Browse with no filters set", () => {
    expect(href(RouteBrowse({ term: "", location: "", status: "" }))).toBe("/");
  });
});
