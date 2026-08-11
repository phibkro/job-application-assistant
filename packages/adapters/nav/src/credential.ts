import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import { SourceUnavailable } from "../../../domain/src/Failure.ts";
import { NAV_SOURCE_ID } from "./decode.ts";

export const PUBLIC_TOKEN_URL = "https://pam-stilling-feed.nav.no/api/publicToken";

/**
 * The only credential surface the NAV adapter needs. Acquisition remains an
 * effect so a request can share a cold public-token fetch, while invalidation
 * is conditional on the token presented by that request: a late 401 must not
 * evict a newer token already installed by another request.
 */
export interface NavCredential {
  readonly get: () => Effect.Effect<string, SourceUnavailable>;
  readonly invalidate: (expectedToken: string) => Effect.Effect<void>;
}

const unavailable = (status?: number): SourceUnavailable =>
  new SourceUnavailable({ source: NAV_SOURCE_ID, ...(status === undefined ? {} : { status }) });

/**
 * Parses NAV's plain-text public-token response without retaining or exposing
 * the body. Only the final non-empty line is considered, and it must contain
 * exactly three non-empty JWT-safe segments.
 */
export const parsePublicToken = (body: string): string | undefined => {
  const lines = body.split(/\r\n|\n|\r/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const candidate = lines[index]?.trim() ?? "";
    if (candidate.length === 0) continue;
    const segments = candidate.split(".");
    if (segments.length !== 3 || segments.some((segment) => !/^[A-Za-z0-9_-]+$/.test(segment))) {
      return undefined;
    }
    return candidate;
  }
  return undefined;
};

const fetchPublicToken = (
  client: HttpClient.HttpClient,
): Effect.Effect<string, SourceUnavailable> =>
  Effect.gen(function* () {
    const response = yield* client
      .execute(
        HttpClientRequest.get(PUBLIC_TOKEN_URL, {
          headers: { Accept: "text/plain" },
        }),
      )
      .pipe(Effect.mapError(() => unavailable()));

    if (response.status < 200 || response.status >= 300) {
      return yield* Effect.fail(unavailable(response.status));
    }

    const body = yield* response.text.pipe(Effect.mapError(() => unavailable()));
    const token = parsePublicToken(body);
    if (token === undefined) {
      return yield* Effect.fail(unavailable());
    }
    return token;
  });

type PublicCacheEntry = {
  readonly effect: Effect.Effect<string, SourceUnavailable>;
  token: string | undefined;
};

/**
 * Builds a public runtime credential. The cache belongs to this capability
 * instance (and therefore to the Worker isolate that owns it), and
 * `Effect.cached` makes concurrent cold callers share one acquisition.
 */
export const makePublicNavCredential = (client: HttpClient.HttpClient): NavCredential => {
  let current: PublicCacheEntry | undefined;

  const makeEntry = (): PublicCacheEntry => {
    const entry = {
      token: undefined as string | undefined,
      effect: undefined as unknown as Effect.Effect<string, SourceUnavailable>,
    };
    const acquisition = fetchPublicToken(client).pipe(
      Effect.tap((token) =>
        Effect.sync(() => {
          entry.token = token;
        }),
      ),
      // A failed public fetch is not a credential. Drop it so a later request
      // can attempt acquisition again, while concurrent callers still share
      // the same in-flight effect and failure.
      Effect.onExit((exit) =>
        Exit.isFailure(exit)
          ? Effect.sync(() => {
              if (current === entry) current = undefined;
            })
          : Effect.void,
      ),
    );
    entry.effect = Effect.runSync(Effect.cached(acquisition));
    return entry;
  };

  return {
    get: () =>
      Effect.suspend(() => {
        if (current === undefined) current = makeEntry();
        return current.effect;
      }),
    invalidate: (expectedToken) =>
      Effect.sync(() => {
        if (current?.token === expectedToken) current = undefined;
      }),
  };
};

/** Creates a runtime-only private credential. It never performs public fetch. */
export const makePrivateNavCredential = (token: string): NavCredential => {
  const value = token.trim();
  return {
    get: () => (value.length === 0 ? Effect.fail(unavailable()) : Effect.succeed(value)),
    invalidate: () => Effect.void,
  };
};

/** Selects private mode for a non-empty runtime token, otherwise public mode. */
export const makeNavCredential = (client: HttpClient.HttpClient, token?: string): NavCredential =>
  token !== undefined && token.trim().length > 0
    ? makePrivateNavCredential(token)
    : makePublicNavCredential(client);
