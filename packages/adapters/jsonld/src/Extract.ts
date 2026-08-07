import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { RawListing } from "../../../domain/src/Job.ts";
import { DecodeFailed } from "../../../domain/src/Failure.ts";
import type { SourceId } from "../../../domain/src/Ids.ts";
import { findLdJsonBlocks } from "./ScriptBlocks.ts";
import { hasJobPostingType, isRecord, JobPosting, toRawListing } from "./JobPosting.ts";

/**
 * Every node a parsed `<script type="application/ld+json">` block can hold,
 * reduced to a flat list of candidate nodes.
 *
 * A block may be one bare object, an array of objects, or a
 * `{ "@graph": [...] }` wrapper — all three are legitimate JSON-LD, and a
 * page commonly mixes unrelated node types (`Organization`, `BreadcrumbList`)
 * in with the one that matters here. Flattening first means the JobPosting
 * filter downstream only has to handle one shape: a list of nodes.
 */
const flattenNodes = (parsed: unknown): ReadonlyArray<unknown> => {
  if (Array.isArray(parsed)) return parsed.flatMap(flattenNodes);
  if (isRecord(parsed) && Array.isArray(parsed["@graph"])) {
    return (parsed["@graph"] as ReadonlyArray<unknown>).flatMap(flattenNodes);
  }
  return [parsed];
};

/**
 * Parses every ld+json block on the page and keeps the nodes tagged
 * `JobPosting`. A block that is not valid JSON is skipped rather than
 * failed: it is as likely to be a third party's malformed markup (an
 * analytics or SEO snippet) as it is to be ours, and one broken unrelated
 * script tag must not take down extraction of the postings that are fine.
 */
const jobPostingNodes = (html: string): ReadonlyArray<unknown> =>
  findLdJsonBlocks(html).flatMap((block) => {
    try {
      return flattenNodes(JSON.parse(block)).filter(hasJobPostingType);
    } catch {
      return [];
    }
  });

/**
 * Extracts every `JobPosting` on the page as a `RawListing`.
 *
 * Once a node has declared `@type: "JobPosting"`, it has made a claim this
 * adapter can check — a node that then fails to decode (wrong-typed
 * `title`, no `datePosted`) fails the whole extraction rather than being
 * dropped silently, the same choice the NAV adapter makes for its envelope:
 * a claimed shape that does not hold is a decode failure, not an empty result.
 */
export const extractJobPostings = (
  html: string,
  context: { readonly sourceId: SourceId; readonly sourceName: string; readonly pageUrl: string },
): Effect.Effect<ReadonlyArray<RawListing>, DecodeFailed> =>
  Effect.gen(function* () {
    const nodes = jobPostingNodes(html);
    const postings = yield* Effect.forEach(nodes, (node) =>
      Schema.decodeUnknownEffect(JobPosting)(node).pipe(
        Effect.mapError(
          (issue) =>
            new DecodeFailed({
              source: context.sourceId,
              field: "JobPosting",
              detail: issue instanceof Error ? issue.message : String(issue),
            }),
        ),
      ),
    );
    return yield* Effect.forEach(postings, (posting) => toRawListing(posting, context));
  });
