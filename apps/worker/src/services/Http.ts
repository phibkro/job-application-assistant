import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type { RateLimited, SourceUnavailable, Unauthorized } from "@job-index/domain/Failure";

/**
 * Outbound HTTP, as a seam.
 *
 * Both acquisition adapters reached for the global `fetch` because this did not
 * exist, which works but makes every adapter test stub a global. A seam moves
 * that to a layer: the same adapter can be given a recorded transcript, a
 * rate-limited stub, or the real network without touching its code.
 *
 * The failure type is the domain's, not the transport's. An adapter should not
 * translate a status code into meaning — that mapping belongs here, once,
 * because "429 means back off later" is the same fact for every source.
 */
export interface Fetched {
  readonly status: number;
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
}

export class Http extends Context.Service<
  Http,
  {
    readonly get: (
      url: string,
      headers?: Readonly<Record<string, string>>,
    ) => Effect.Effect<Fetched, SourceUnavailable | RateLimited | Unauthorized>;

    readonly post: (
      url: string,
      body: string,
      headers?: Readonly<Record<string, string>>,
    ) => Effect.Effect<Fetched, SourceUnavailable | RateLimited | Unauthorized>;
  }
>()("@job-index/Http") {}
