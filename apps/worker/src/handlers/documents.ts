import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import {
  CurrentPrincipal,
  DocumentTooLarge,
  MAX_DOCUMENT_CHARS,
  NotFound,
  UpgradeRequired,
} from "../Api.ts";
import { api } from "../Api.ts";
import type { DocumentSummary } from "../Api.ts";
import type { DocumentView } from "../Api.ts";
import { StudioDocument } from "@job-index/domain/Documents";
import type { JobSnapshot } from "@job-index/domain/Job";
import { DocumentId, SavedJobId } from "@job-index/domain/Ids";
import type { EntitlementRequired, ProfileIncomplete } from "@job-index/domain/Failure";
import { Database } from "../services/Database.ts";
import { Profiles } from "../services/Accounts.ts";
import { ModelStudioComposer, TemplateStudioComposer } from "../services/Studio.ts";
import { Entitlements } from "../services/Entitlements.ts";
import { Ids } from "../services/Ids.ts";
import { SavedJobs } from "../services/SavedJobs.ts";
import * as DocumentsRepo from "../db/repositories/Documents.ts";
import { decodeDocumentId } from "./wire.ts";

const decodeDocumentIdSync = Schema.decodeUnknownSync(DocumentId);
const decodeSavedJobIdSync = Schema.decodeUnknownSync(SavedJobId);

/**
 * The studio's server half (WS-0018).
 *
 * Engine selection mirrors proposals' create (`handlers/proposals.ts`): the
 * default request never consults entitlements; `engine: "model"` checks
 * `model-drafting` first (402 when unheld), then tries the model composer,
 * degrading to the template output plus a `downgradeReason` when it cannot
 * run. Each request path composes exactly once — the model success uses the
 * model text, every other outcome composes through the template layer, so a
 * document's `engine` column always names what actually produced its bytes.
 *
 * A targeted document grounds on `SavedJobs.resolve`'s frozen snapshot and
 * stores a copy beside itself, exactly as an application row does. Unknown
 * saved job, unknown document, and another principal's document all answer
 * 404 — ownership is a predicate, never a post-hoc check.
 *
 * Regeneration is not a route: the client calls `create` again. Older
 * versions survive until their owner deletes them.
 */
export const layer = HttpApiBuilder.group(api, "documents", (handlers) =>
  handlers
    .handle("create", ({ payload }) =>
      Effect.gen(function* () {
        const database = yield* Database;
        const ids = yield* Ids;
        const principal = yield* CurrentPrincipal;
        const profiles = yield* Profiles;
        const savedJobs = yield* SavedJobs;
        const templates = yield* TemplateStudioComposer;

        const jobId = payload.jobId === undefined ? undefined : decodeSavedJobIdSync(payload.jobId);
        const snapshot: JobSnapshot | undefined =
          jobId === undefined
            ? undefined
            : yield* Effect.flatMap(savedJobs.resolve(principal.profileId, jobId), (resolved) =>
                resolved === undefined
                  ? Effect.fail(new NotFound({ message: `no saved job with id ${payload.jobId}` }))
                  : Effect.succeed(resolved),
              );

        const profile = yield* profiles.get(principal.profileId);
        const answers = yield* profiles.answers(principal.profileId);

        let downgradeReason: string | null = null;
        let composed:
          | {
              readonly kind: typeof payload.kind;
              readonly content: string;
              readonly engine: "template" | "model";
            }
          | undefined;
        if (payload.engine === "model") {
          const entitlements = yield* Entitlements;
          yield* entitlements
            .require(principal.profileId, "model-drafting")
            .pipe(
              Effect.catchTag("EntitlementRequired", (failure: EntitlementRequired) =>
                Effect.fail(new UpgradeRequired({ capability: failure.capability })),
              ),
            );
          const model = yield* ModelStudioComposer;
          const attempted = yield* Effect.result(
            model.compose(profile, answers, payload.kind, snapshot),
          );
          if (attempted._tag === "Success") {
            composed = attempted.success;
          } else {
            downgradeReason = attempted.failure.reason;
          }
        }
        if (composed === undefined) {
          composed = yield* templates
            .compose(profile, answers, payload.kind, snapshot)
            .pipe(
              Effect.catchTag("ProfileIncomplete", (failure: ProfileIncomplete) =>
                Effect.fail(new NotFound({ message: `profile is missing: ${failure.missing}` })),
              ),
            );
        }
        const now = yield* DateTime.now;
        const document = new StudioDocument({
          id: decodeDocumentIdSync(yield* ids.next),
          profileId: principal.profileId,
          jobId: jobId === undefined ? Option.none() : Option.some(jobId),
          jobSnapshot: snapshot === undefined ? Option.none() : Option.some(snapshot),
          kind: payload.kind,
          engine: composed.engine,
          content: composed.content,
          createdAt: now,
          updatedAt: now,
        });

        yield* Effect.provideService(DocumentsRepo.insert(document), Database, database);

        return { data: withContent(document), downgradeReason };
      }),
    )
    .handle("list", ({ query }) =>
      Effect.gen(function* () {
        const database = yield* Database;
        const principal = yield* CurrentPrincipal;
        // The saved-list precedent (savedService.parseCursor): a garbage or
        // negative cursor clamps to the start rather than wrapping slice().
        const parsed = query.cursor === undefined ? Number.NaN : Number(query.cursor);
        const offset = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
        const page = yield* Effect.provideService(
          DocumentsRepo.findByProfilePage(principal.profileId, offset),
          Database,
          database,
        );
        return {
          data: page.data.map(toSummary),
          meta: {
            limit: DocumentsRepo.PAGE_LIMIT,
            nextCursor: page.nextCursor,
          },
        };
      }),
    )
    .handle("get", ({ params }) =>
      Effect.gen(function* () {
        const database = yield* Database;
        const principal = yield* CurrentPrincipal;
        const id = decodeDocumentId(params.id);
        const found = yield* Effect.provideService(
          DocumentsRepo.findByIdForProfile(id, principal.profileId),
          Database,
          database,
        );
        if (found === undefined) {
          return yield* Effect.fail(new NotFound({ message: `no document with id ${params.id}` }));
        }
        return withContent(found);
      }),
    )
    .handle("updateContent", ({ params, payload }) =>
      Effect.gen(function* () {
        const database = yield* Database;
        const principal = yield* CurrentPrincipal;
        if (payload.content.length > MAX_DOCUMENT_CHARS) {
          return yield* Effect.fail(new DocumentTooLarge({ limit: MAX_DOCUMENT_CHARS }));
        }
        const id = decodeDocumentId(params.id);
        const now = yield* DateTime.now;
        const affected = yield* Effect.provideService(
          DocumentsRepo.updateContent(
            id,
            principal.profileId,
            payload.content,
            DateTime.formatIso(now),
          ),
          Database,
          database,
        );
        if (affected === 0) {
          return yield* Effect.fail(new NotFound({ message: `no document with id ${params.id}` }));
        }
        const updated = yield* Effect.provideService(
          DocumentsRepo.findByIdForProfile(id, principal.profileId),
          Database,
          database,
        );
        return withContent(updated!);
      }),
    )
    .handle("remove", ({ params }) =>
      Effect.gen(function* () {
        const database = yield* Database;
        const principal = yield* CurrentPrincipal;
        const affected = yield* Effect.provideService(
          DocumentsRepo.deleteByIdForProfile(decodeDocumentId(params.id), principal.profileId),
          Database,
          database,
        );
        if (affected === 0) {
          return yield* Effect.fail(new NotFound({ message: `no document with id ${params.id}` }));
        }
        return { deleted: params.id };
      }),
    ),
);

/**
 * The list-facing projection: everything a picker needs, never the body.
 * `jobTitle` comes from the stored frozen copy so the list stays
 * self-describing without a join.
 */
const toSummary = (document: StudioDocument): typeof DocumentSummary.Type => ({
  id: document.id,
  kind: document.kind,
  engine: document.engine,
  jobId: Option.getOrUndefined(document.jobId) ?? null,
  jobTitle: Option.isSome(document.jobSnapshot) ? document.jobSnapshot.value.title : null,
  createdAt: DateTime.formatIso(document.createdAt),
  updatedAt: DateTime.formatIso(document.updatedAt),
});

const withContent = (document: StudioDocument): DocumentView => ({
  ...toSummary(document),
  content: document.content,
});
