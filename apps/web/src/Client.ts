import * as Option from "effect/Option";
import * as HttpApiClient from "effect/unstable/httpapi/HttpApiClient";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
// Api.ts is the frozen worker/interface seam (see apps/worker/src/Api.ts). It is
// reached by a relative import, not the `@job-index/worker/*` bare specifier,
// because the root tsconfig only wires path resolution for `@job-index/domain/*`
// — the worker alias exists in vitest.config.ts (for tests) but not in
// tsconfig.json's `paths` (for tsc). A relative import needs neither: both tsc
// and Vite resolve a real filesystem path on their own, so it works under both
// `bun run typecheck` and `bun run test` without touching root-owned config.
import { api } from "../../worker/src/Api.ts";

/**
 * Where the worker is reachable from this browser session.
 *
 * A build-time default that a deployment can override without a code change:
 * Vite inlines `import.meta.env.VITE_API_BASE_URL` at bundle time, and an
 * unset value falls back to same-origin relative paths, which is what local
 * dev behind a proxy and a same-host production deploy both want.
 */
export const apiBaseUrl: string =
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL ?? "";

/**
 * Builds the typed API client, carrying the session token as a header when
 * present.
 *
 * The contract in `Api.ts` declares no `HttpApiSecurity` scheme or `headers`
 * field on any endpoint — there is no typed place to put a token. This
 * attaches it below the schema layer instead, via `transformClient`, which
 * rewrites the raw `HttpClient` the typed client is built from. That is a
 * genuine contract gap (see the report): the interface slot cannot express
 * "this call is authenticated" in a way the compiler checks, only in a way
 * this one call site remembers to do. A `Bearer` scheme is this slot's
 * assumption, not something the frozen contract states.
 */
export const makeClient = (token: Option.Option<string>) =>
  HttpApiClient.make(api, {
    baseUrl: apiBaseUrl,
    transformClient: (client) =>
      Option.match(token, {
        onNone: () => client,
        onSome: (value) =>
          HttpClient.mapRequest(
            client,
            HttpClientRequest.setHeader("Authorization", `Bearer ${value}`),
          ),
      }),
  });
