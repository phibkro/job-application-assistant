import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpClient from "effect/unstable/http/HttpClient";
import {
  make as makeNavAdapter,
  makePrivateNavCredential,
  makePublicNavCredential,
  type NavCredential,
} from "@job-index/adapters/nav";
import { retentionBoundary } from "@job-index/domain/Retention";
import type { Accounts, Profiles } from "../services/Accounts.ts";
import type { Applications } from "../services/Applications.ts";
import type { Corpus } from "../services/Corpus.ts";
import type { Database } from "../services/Database.ts";
import type { Drafting } from "../services/Drafting.ts";
import type { Entitlements } from "../services/Entitlements.ts";
import type { Hydration } from "../services/Hydration.ts";
import type { Ingestion } from "../services/Ingestion.ts";
import type { Judgements } from "../services/Judgements.ts";
import type { Policy } from "../services/Policy.ts";
import type { Saved } from "../services/Saved.ts";
import type { SavedJobs } from "../services/SavedJobs.ts";
import type { SourceCatalog } from "../services/SourceCatalog.ts";
// `../db/index.ts` is the persistence slot's full surface, and it re-exports
// `layerSqlite` — a test layer that imports `bun:sqlite`. Importing the barrel
// here drags a Bun builtin into the Worker bundle, which fails the build
// outright (verified: `bun build --target=browser` refuses it). The production
// layer is imported from its own module so the test engine is not reachable
// from the entry point at all.
import { layer as databaseLayer } from "../db/Live.ts";
import { layer as accountsLayer } from "../accounts/index.ts";
import { layer as acquisitionLayer } from "../acquisition/index.ts";
import { layer as corpusLayer } from "../corpus/index.ts";
import { layer as applicationsLayer } from "../applications/index.ts";
import { layer as catalogLayer } from "../catalog/index.ts";
import { layer as draftingLayer } from "../drafting/index.ts";
import { layer as hydrationLayer } from "../hydration/index.ts";
import { layer as ingestionLayer } from "../ingestion/index.ts";
import { hydrationLeaseLayer, layer as sourceLeaseLayer } from "../ingestion/SourceLeaseObject.ts";
import { layer as idsLayer } from "./Ids.ts";
import type { Env } from "./Env.ts";

/**
 * The one concrete HTTP transport every adapter is wired to. Built once,
 * here — this is "the only place that knows which implementation satisfies
 * which tag" (see this module's own doc below) — and handed to an adapter's
 * `make` as an ordinary constructor argument, the same way `env.NAV_API_TOKEN`
 * already is: an adapter asks for a resolved `HttpClient`, never for the
 * ambient `fetch` global, so a test can give it a fake with no network in
 * reach (see `packages/adapters/nav/src/index.test.ts`).
 *
 * `Effect.runSync` is safe here because `FetchHttpClient.layer` does no
 * asynchronous or scoped setup — it merges a plain, already-constructed
 * `HttpClient` value into context (see its source) — so resolving it outside
 * of any running Effect costs nothing and blocks on nothing.
 */
const httpClient: HttpClient.HttpClient = Effect.runSync(
  Effect.provide(HttpClient.HttpClient, FetchHttpClient.layer),
);

const publicNavCredential = makePublicNavCredential(httpClient);
let privateNavCredentialToken: string | undefined;
let privateNavCredential: NavCredential | undefined;

const navCredentialFor = (token: string | undefined): NavCredential => {
  const value = token?.trim();
  if (value === undefined || value.length === 0) {
    return publicNavCredential;
  }
  if (privateNavCredential === undefined || privateNavCredentialToken !== value) {
    privateNavCredential = makePrivateNavCredential(value);
    privateNavCredentialToken = value;
  }
  return privateNavCredential;
};

/**
 * Every service the worker runs on, wired to one D1 binding.
 *
 * This is the only place that knows which implementation satisfies which tag.
 * A slot exports `layer` from a fixed path and never imports another slot, so
 * the whole graph converges here and nowhere else — which is why the wiring is
 * one file rather than an import in each handler.
 *
 * `Database` is provided beneath the services that consume it and re-exported
 * alongside them: handlers need `Corpus` and `Profiles`, and the erasure sweep
 * needs `Database` itself, so both are in the output.
 */
export type Services =
  | Database
  | Corpus
  | Judgements
  | Accounts
  | Profiles
  | Drafting
  | Applications
  | Entitlements
  | Hydration
  | Policy
  | SavedJobs
  | Saved
  | SourceCatalog
  | Ingestion;

/**
 * `applicationsLayer` is provided last because it consumes what the others
 * export — `Corpus`, `Profiles`, `Drafting` — as services rather than as
 * tables. That ordering is the dependency graph, written down: `prepare` asks
 * `Policy` whether a platform allows automation, it does not read
 * `source_catalog` behind its back.
 *
 * `Ingestion` is provided the same way, one step further out: it needs
 * `Acquisition`, `Corpus`, `SourceCatalog`, `Database`, and `SourceLease`, so
 * it is composed only after `leaves` already carries the first four.
 * `Acquisition` and `SourceLease` are never added to `Services` — nothing
 * outside this file talks to either directly, `Ingestion` is the one
 * consumer, exactly as the plugin-surface design spec anticipated ("the next
 * real registration list ... belongs to whichever change implements
 * `Ingestion`"). NAV is registered here, not inside `acquisition/index.ts`,
 * because only this file has `env` — and therefore `env.NAV_API_TOKEN` and
 * `env.SOURCE_LEASE` — in scope.
 *
 * `Hydration` is composed the same way, alongside `Ingestion` rather than
 * after it: both need `Acquisition` and `Corpus`, neither needs the other,
 * so they are independent branches over the same `withApplications` context
 * rather than one layered on top of the second. `HydrationLease` reuses
 * `env.SOURCE_LEASE` — the same binding `SourceLease` is wired to — see
 * `ingestion/SourceLeaseObject.ts`'s `hydrationLeaseLayer`.
 */
export const services = (env: Env): Layer.Layer<Services> => {
  // `idsLayer` needs nothing (see `runtime/Ids.ts`), so it joins the merge
  // unconditionally rather than threading through `provideMerge` — the same
  // reason `catalogLayer` sits beside `corpusLayer` here instead of after it.
  const leaves = Layer.mergeAll(
    corpusLayer,
    accountsLayer,
    draftingLayer,
    catalogLayer,
    idsLayer,
  ).pipe(Layer.provideMerge(databaseLayer(env.DB)));
  const withApplications = Layer.provideMerge(applicationsLayer, leaves);

  const acquisition = acquisitionLayer([
    {
      tier: "Feed",
      // A fresh sweep starts at the retention boundary rather than at the
      // feed's first entry: what we will not keep, we need not read.
      adapter: makeNavAdapter(
        httpClient,
        navCredentialFor(env.NAV_API_TOKEN),
        retentionBoundary(new Date()),
      ),
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

  return Layer.provideMerge(Layer.mergeAll(ingestion, hydration), withApplications);
};
