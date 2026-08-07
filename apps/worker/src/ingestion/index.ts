import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Acquisition } from "../services/Acquisition.ts";
import { Corpus } from "../services/Corpus.ts";
import { Database } from "../services/Database.ts";
import { SourceCatalog } from "../services/SourceCatalog.ts";
import { SourceLease } from "../services/SourceLease.ts";
import { Ingestion } from "../services/Ingestion.ts";
import { makeCollect } from "./collect.ts";

/**
 * `Ingestion`, wired to the services `collect` composes: `Acquisition` for
 * one bounded page, `Corpus` to fold and to close, `SourceCatalog` for where
 * a never-before-collected platform's sweep begins, `SourceLease` for
 * whether this run may proceed at all, and `Database` directly for this
 * slot's own state (`source_state`, `ingestion_runs`, `ingestion_failures` —
 * none of which `Corpus` or `SourceCatalog` know about, and none of which
 * should).
 */
export const layer = Layer.effect(
  Ingestion,
  Effect.gen(function* () {
    const database = yield* Database;
    const acquisition = yield* Acquisition;
    const corpus = yield* Corpus;
    const sourceCatalog = yield* SourceCatalog;
    const sourceLease = yield* SourceLease;
    return Ingestion.of({
      collect: makeCollect({ database, acquisition, corpus, sourceCatalog, sourceLease }),
    });
  }),
);
