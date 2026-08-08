import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CatalogRecord } from "@job-index/domain/Source";
import type { AcquisitionTier, AutomationPolicy, CatalogEntry } from "@job-index/domain/Source";
import type { PlatformId } from "@job-index/domain/Ids";
import { Database } from "../services/Database.ts";
import { SourceCatalog } from "../services/SourceCatalog.ts";

/**
 * The researched platform catalogue: which sources exist, how each may be
 * read, and what its terms permit.
 *
 * Read-only here. The catalogue is research output — a person reads a
 * platform's terms and records what they found — so nothing in the request
 * path writes it, and a service that could would be a way to grant an
 * automation policy no one assessed.
 */
const FIELDS = Object.keys(CatalogRecord.select.fields);

type Row = typeof CatalogRecord.select.Encoded;

const SELECT_ALL = `SELECT ${FIELDS.join(", ")} FROM source_catalog ORDER BY priority ASC, platform ASC`;

const SELECT_BY_TIER = `SELECT ${FIELDS.join(", ")} FROM source_catalog WHERE tierTag = ? ORDER BY priority ASC, platform ASC`;

/** The row's flat tags become the domain's unions again; see `CatalogRecord`. */
const entryOf = (row: Row): CatalogEntry => ({
  id: row.id as PlatformId,
  platform: row.platform,
  category: row.category,
  listingsUrl: row.listingsUrl,
  ...(row.feedUrl === null || row.feedUrl === undefined ? {} : { feedUrl: row.feedUrl }),
  tier: { _tag: row.tierTag } as AcquisitionTier,
  policy: { _tag: row.policyTag } as AutomationPolicy,
  requiresPremium: row.requiresPremium === 1,
  priority: row.priority,
  confidence: row.confidence,
  notes: row.notes,
  verifiedAt: row.verifiedAt,
});

export const layer = Layer.effect(
  SourceCatalog,
  Effect.gen(function* () {
    const database = yield* Database;
    return SourceCatalog.of({
      list: (tier?: AcquisitionTier) =>
        Effect.map(
          tier === undefined
            ? database.query<Row>(SELECT_ALL, [])
            : database.query<Row>(SELECT_BY_TIER, [tier._tag]),
          (rows) => rows.map(entryOf),
        ),
    });
  }),
);
