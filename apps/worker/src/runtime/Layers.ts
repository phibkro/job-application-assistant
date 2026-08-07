import * as Layer from "effect/Layer";
import { make as makeNavAdapter } from "@job-index/adapters/nav";
import type { Accounts, Profiles } from "../services/Accounts.ts";
import type { Applications } from "../services/Applications.ts";
import type { Corpus } from "../services/Corpus.ts";
import type { Database } from "../services/Database.ts";
import type { Drafting } from "../services/Drafting.ts";
import type { Entitlements } from "../services/Entitlements.ts";
import type { Ingestion } from "../services/Ingestion.ts";
import type { Judgements } from "../services/Judgements.ts";
import type { Policy } from "../services/Policy.ts";
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
import { layer as ingestionLayer } from "../ingestion/index.ts";
import type { Env } from "./Env.ts";

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
  | Policy
  | SavedJobs
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
 * `Acquisition`, `Corpus`, `SourceCatalog`, and `Database`, so it is composed
 * only after `leaves` already carries all four. `Acquisition` itself is
 * never added to `Services` — nothing outside this file talks to it
 * directly, `Ingestion` is the one consumer, exactly as the plugin-surface
 * design spec anticipated ("the next real registration list ... belongs to
 * whichever change implements `Ingestion`"). NAV is registered here, not
 * inside `acquisition/index.ts`, because only this file has `env` — and
 * therefore `env.NAV_API_TOKEN` — in scope.
 */
export const services = (env: Env): Layer.Layer<Services> => {
  const leaves = Layer.mergeAll(corpusLayer, accountsLayer, draftingLayer, catalogLayer).pipe(
    Layer.provideMerge(databaseLayer(env.DB)),
  );
  const withApplications = Layer.provideMerge(applicationsLayer, leaves);

  const acquisition = acquisitionLayer([
    { tier: "Feed", adapter: makeNavAdapter(env.NAV_API_TOKEN) },
  ]);
  const ingestion = ingestionLayer.pipe(Layer.provide(acquisition));

  return Layer.provideMerge(ingestion, withApplications);
};
