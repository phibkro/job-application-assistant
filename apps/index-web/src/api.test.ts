import { Effect, Layer, Option } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { Schema } from "effect";
import { CanonicalJob } from "@job-index/domain/Job";
import { getJob, listCurrentJobs } from "./api.ts";
import { developerJob, pageOf } from "./main.fixture.ts";

const encodeJob = Schema.encodeSync(CanonicalJob);

/** A client that records each request URL and answers with `respond`. */
const stubClient = (respond: (url: URL) => Response) => {
  const seen: Array<URL> = [];
  const client = HttpClient.make((request) =>
    Effect.sync(() => {
      const url = Option.getOrThrow(HttpClientRequest.toUrl(request));
      seen.push(url);
      return HttpClientResponse.fromWeb(request, respond(url));
    }),
  );
  return { seen, layer: Layer.succeed(HttpClient.HttpClient, client) };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("typed read client", () => {
  // The client issues same-origin relative URLs, which the browser resolves
  // against `location`; Bun has none, so the page's origin is stubbed.
  beforeAll(() => {
    vi.stubGlobal("location", new URL("http://localhost/"));
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  test("lists current vacancies with the filters, the Active status and the page limit", async () => {
    const { seen, layer } = stubClient(() =>
      json({ data: [encodeJob(developerJob)], meta: { limit: 50, nextCursor: null } }),
    );
    const page = await Effect.runPromise(
      listCurrentJobs({ term: Option.some("utvikler"), location: Option.none() }).pipe(
        Effect.provide(layer),
      ),
    );
    expect(page).toStrictEqual(pageOf([developerJob]));
    const url = seen[0]!;
    expect(url.pathname).toBe("/api/v1/jobs");
    expect(url.searchParams.get("term")).toBe("utvikler");
    expect(url.searchParams.has("location")).toBe(false);
    expect(url.searchParams.get("status")).toBe("Active");
    expect(url.searchParams.get("limit")).toBe("50");
  });

  test("a 404 on a vacancy becomes the not-found reason", async () => {
    const { layer } = stubClient(() => json({ _tag: "NotFound", message: "no job" }, 404));
    const error = await Effect.runPromise(
      Effect.flip(getJob("cj_missing").pipe(Effect.provide(layer))),
    );
    expect(error).toBe("No vacancy has this id.");
  });

  test("any other failure becomes a generic reason", async () => {
    const { layer } = stubClient(() => new Response("boom", { status: 500 }));
    const error = await Effect.runPromise(Effect.flip(getJob("cj_2").pipe(Effect.provide(layer))));
    expect(error).toBe("The vacancy could not be loaded.");
  });
});
