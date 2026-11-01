import { env } from "cloudflare:workers";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { make as makeNavAdapter, makePrivateNavCredential } from "@job-index/adapters/nav";
import { detailObservation, feedObservations } from "@job-index/adapters/nav";
import type { ObservationContent } from "@job-index/domain/observation/Ir";
// @ts-expect-error `?raw` is resolved by Vite inside workerd; no ambient JSON `?raw` type exists
import feedPageRaw from "../../../../fixtures/nav/feed-page.json?raw";
// @ts-expect-error same as above
import detailActiveRaw from "../../../../fixtures/nav/detail-active.json?raw";
// @ts-expect-error same as above
import liveDetailRaw from "../../../../fixtures/nav/live-detail.json?raw";
// @ts-expect-error same pattern as `testSupport/applySchema.ts`'s `db/schema.sql?raw` import
import catalogSeedSql from "../../../../db/catalog-seed.sql?raw";
import { layer as databaseLayer } from "../db/Live.ts";
import { layer as acquisitionLayer } from "../acquisition/index.ts";
import { layer as catalogLayer } from "../catalog/index.ts";
import { layer as corpusLayer } from "../corpus/index.ts";
import { layer as hydrationLayer } from "../hydration/index.ts";
import { layer as ingestionLayer } from "../ingestion/index.ts";
import { hydrationLeaseLayer, layer as sourceLeaseLayer } from "../ingestion/SourceLeaseObject.ts";
import { layer as idsLayer } from "../runtime/Ids.ts";
import { Ingestion } from "../services/Ingestion.ts";

/**
 * Fixtures and a scripted NAV for the WS-0022 workerd tests. Variants are derived in code from the checked-in
 * `fixtures/nav/*.json` (no new fixture files), as WS-0020 and WS-0024 did. The pipeline mirrors
 * `runtime/Layers.ts` `services(env)` with one substitution, the NAV `HttpClient`, exactly as
 * `handlers/navToClient.live.test.ts` does.
 */

type Json = Record<string, unknown>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const FEED_PAGE: Json = JSON.parse(feedPageRaw);
export const DETAIL_ACTIVE: Json = JSON.parse(detailActiveRaw);
export const LIVE_DETAIL: Json = JSON.parse(liveDetailRaw);
const ITEMS = FEED_PAGE.items as ReadonlyArray<Json>;
/** `active-vacancy-1`: ACTIVE. */
export const ACTIVE_ITEM: Json = ITEMS[0] as Json;
/** `inactive-vacancy-2`: INACTIVE. */
export const INACTIVE_ITEM: Json = ITEMS[1] as Json;
export const POSTING_URL = "https://arbeidsplassen.nav.no/stillinger/stilling/active-vacancy-1";

/** NAV's wire name for the feed extension, kept in one constant (the repository bans dangling underscores). */
export const FEED_ENTRY = "_feed_entry";
const entryOf = (item: Json): Json => item[FEED_ENTRY] as Json;
export const uuidOf = (item: Json): string => String(entryOf(item).uuid);

export const withUuid = (item: Json, uuid: string): Json => ({
  ...clone(item),
  id: `entry-${uuid}`,
  url: `/api/v1/feedentry/${uuid}`,
  [FEED_ENTRY]: { ...entryOf(item), uuid },
});

/** The item with a different feed title (so equal-title identity, D05, does not merge test adverts). */
export const withTitle = (item: Json, title: string): Json => ({
  ...clone(item),
  title,
  [FEED_ENTRY]: { ...entryOf(item), title },
});

export const withStatus = (item: Json, status: string, modified: string): Json => ({
  ...clone(item),
  date_modified: modified,
  [FEED_ENTRY]: { ...entryOf(item), status, sistEndret: modified },
});

export const page = (...items: ReadonlyArray<Json>): Json => ({ ...clone(FEED_PAGE), items });

/** `detail-active.json` re-identified, optionally with an extent, a sentence appended, a status, a modified time. */
export const detail = (
  uuid: string,
  options: {
    readonly extent?: string;
    readonly append?: string;
    readonly status?: string;
    readonly modified?: string;
  } = {},
): Json => {
  const base = clone(DETAIL_ACTIVE) as Json & { ad_content: Json };
  const content: Json = { ...base.ad_content, uuid };
  if (options.extent !== undefined) content.extent = options.extent;
  if (options.append !== undefined)
    content.description = `${String(content.description)}<p>${options.append}</p>`;
  return {
    ...base,
    uuid,
    ...(options.status === undefined ? {} : { status: options.status }),
    ...(options.modified === undefined ? {} : { sistEndret: options.modified }),
    ad_content: content,
  };
};

export const feedContents = (json: unknown): ReadonlyArray<ObservationContent> =>
  Result.getOrThrow(feedObservations(json));
export const detailContent = (json: unknown): ObservationContent =>
  Result.getOrThrow(detailObservation(json));

export const FIFTY = "Stillingen er en 50 % stilling.";

export const seedCatalog = async (): Promise<void> => {
  const statement = (catalogSeedSql as string)
    .split("\n")
    .filter((line: string) => !line.trim().startsWith("--"))
    .join("\n")
    .trim();
  await env.DB.prepare(statement).run();
};

const NAV_HOST = "pam-stilling-feed.nav.no";

/** What the scripted NAV answers. Unscripted URLs die, so a stray request fails the test loudly. */
export interface NavScript {
  firstPage: Json;
  readonly details: Map<string, Json>;
  readonly requests: Array<string>;
}

export const navScript = (
  items: ReadonlyArray<Json>,
  details: ReadonlyArray<Json> = [],
): NavScript => ({
  firstPage: page(...items),
  details: new Map(details.map((d) => [String(d.uuid), d] as const)),
  requests: [],
});

const TAIL_PAGE: Json = {
  version: "1",
  title: "NAV vacancies",
  feed_url: "/api/v1/feed/page-2",
  id: "page-2",
  items: [],
};

const respond = (script: NavScript, url: URL): unknown => {
  if (url.host !== NAV_HOST) return undefined;
  if (url.pathname === "/api/v1/feed") return script.firstPage;
  if (url.pathname === "/api/v1/feed/page-2") return TAIL_PAGE;
  const uuid = url.pathname.match(/^\/api\/v1\/feedentry\/(.+)$/)?.[1];
  return uuid === undefined ? undefined : script.details.get(uuid);
};

export const scriptedClient = (script: NavScript): HttpClient.HttpClient =>
  HttpClient.make((request, url) =>
    Effect.suspend(() => {
      script.requests.push(url.toString());
      const body = respond(script, url);
      if (body === undefined) {
        return Effect.die(new Error(`WS-0022 scripted NAV: unscripted request ${url.toString()}`));
      }
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      );
    }),
  );

/** `runtime/Layers.ts` `services(env)`'s ingestion slice, with the scripted NAV client. */
export const ingestionFor = (script: NavScript) => {
  const base = Layer.mergeAll(corpusLayer, catalogLayer, idsLayer).pipe(
    Layer.provideMerge(databaseLayer(env.DB)),
  );
  const acquisition = acquisitionLayer([
    {
      tier: "Feed",
      adapter: makeNavAdapter(scriptedClient(script), makePrivateNavCredential("fixture-token")),
    },
  ]);
  const ingestion = ingestionLayer.pipe(
    Layer.provide(acquisition),
    Layer.provide(sourceLeaseLayer(env.SOURCE_LEASE)),
  );
  const hydration = hydrationLayer.pipe(
    Layer.provide(acquisition),
    Layer.provide(hydrationLeaseLayer(env.SOURCE_LEASE)),
  );
  return Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        return yield* Ingestion;
      }),
      Layer.provideMerge(Layer.mergeAll(ingestion, hydration), base),
    ),
  );
};

export const rows = async <T>(sql: string): Promise<ReadonlyArray<T>> =>
  (await env.DB.prepare(sql).all<T>()).results;
