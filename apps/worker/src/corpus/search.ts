import * as Effect from "effect/Effect";
import type { CanonicalJob } from "@job-index/domain/Job";
import type { Sequence } from "@job-index/domain/Ids";
import type { JobFilter } from "../services/Corpus.ts";
import type { DatabaseShape } from "./databaseShape.ts";
import { normalizeText } from "./identity.ts";
import { canonicalJobFromRow, type CanonicalJobRow } from "./rows.ts";
import { SEARCH_CANONICAL_JOBS } from "./sql.ts";

/** SQLite's own `LIKE` wildcards, escaped so a literal `%`/`_` in a search term is not read as one. */
const escapeLikeWildcards = (value: string): string =>
  value.replace(/[\\%_]/g, (char) => `\\${char}`);

/**
 * A `term`/`location` value, folded the same way `titleNormalized` etc.
 * were folded when written (see `rows.ts`) — the fold has to happen on both
 * sides of a `LIKE` for it to mean "case/diacritic-insensitive" rather than
 * "insensitive to ASCII case only", since that is all SQLite's own case
 * folding gives a raw comparison.
 */
const likePattern = (value: string): string => `%${escapeLikeWildcards(normalizeText(value))}%`;

/**
 * Corpus.search: `changedSince`'s filtered counterpart.
 *
 * `term` searches title and employer only, not description. Description is
 * free source text — matching it turns a job search into "grep the
 * corpus": a common word appears in most descriptions, so it would flood a
 * results page rather than narrow it. Title and employer are what a person
 * actually scans a results list by, and what `location` already exists to
 * complement.
 */
export const makeSearch =
  (database: DatabaseShape) =>
  (
    filter: JobFilter,
    cursor: Sequence,
    limit: number,
  ): Effect.Effect<ReadonlyArray<CanonicalJob>> => {
    const hasTerm = filter.term !== undefined;
    const hasLocation = filter.location !== undefined;
    const hasStatus = filter.status !== undefined;
    const sql = SEARCH_CANONICAL_JOBS({ term: hasTerm, location: hasLocation, status: hasStatus });

    const bindings: Array<unknown> = [cursor];
    if (hasTerm) {
      const pattern = likePattern(filter.term as string);
      bindings.push(pattern, pattern);
    }
    if (hasLocation) {
      bindings.push(likePattern(filter.location as string));
    }
    if (hasStatus) {
      bindings.push(filter.status);
    }
    bindings.push(limit);

    return Effect.map(database.query<CanonicalJobRow>(sql, bindings), (rows) =>
      rows.map(canonicalJobFromRow),
    );
  };
