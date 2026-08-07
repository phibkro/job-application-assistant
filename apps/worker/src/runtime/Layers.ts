import * as Layer from "effect/Layer";
import type { Accounts, Profiles } from "../services/Accounts.ts";
import type { Applications } from "../services/Applications.ts";
import type { Corpus } from "../services/Corpus.ts";
import type { Database } from "../services/Database.ts";
import type { Drafting } from "../services/Drafting.ts";
import type { Entitlements } from "../services/Entitlements.ts";
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
import { layer as corpusLayer } from "../corpus/index.ts";
import { layer as applicationsLayer } from "../applications/index.ts";
import { layer as catalogLayer } from "../catalog/index.ts";
import { layer as draftingLayer } from "../drafting/index.ts";
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
  | SourceCatalog;

/**
 * `applicationsLayer` is provided last because it consumes what the others
 * export — `Corpus`, `Profiles`, `Drafting` — as services rather than as
 * tables. That ordering is the dependency graph, written down: `prepare` asks
 * `Policy` whether a platform allows automation, it does not read
 * `source_catalog` behind its back.
 */
export const services = (env: Env): Layer.Layer<Services> => {
  const leaves = Layer.mergeAll(corpusLayer, accountsLayer, draftingLayer, catalogLayer).pipe(
    Layer.provideMerge(databaseLayer(env.DB)),
  );
  return Layer.provideMerge(applicationsLayer, leaves);
};
