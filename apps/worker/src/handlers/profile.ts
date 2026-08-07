import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import { QuestionKey } from "@job-index/domain/Answer";
import { fromJson, toJson, toMarkdown } from "@job-index/domain/Profile";
import { historyToJson, historyToMarkdown } from "@job-index/domain/Applications";
import { api, CurrentPrincipal, InvalidProfileJson } from "../Api.ts";
import { Applications } from "../services/Applications.ts";
import { Profiles } from "../services/Accounts.ts";
import { SavedJobs } from "../services/SavedJobs.ts";
import { Entitlements, type Capability } from "../services/Entitlements.ts";

const decodeQuestionKey = Schema.decodeUnknownSync(QuestionKey);

/** `fromJson` throws `SchemaError` or `JSON.parse`'s `SyntaxError`; both carry the actionable text in `.message`. */
const describeImportFailure = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const ALL_CAPABILITIES: ReadonlyArray<Capability> = [
  "model-drafting",
  "automated-apply",
  "agent-acquisition",
  "scheduled-applications",
];

export const layer = HttpApiBuilder.group(api, "profile", (handlers) =>
  handlers
    .handle("me", () =>
      Effect.gen(function* () {
        const profiles = yield* Profiles;
        const entitlements = yield* Entitlements;
        const principal = yield* CurrentPrincipal;
        const profile = yield* profiles.get(principal.profileId);
        const held = yield* Effect.all(
          ALL_CAPABILITIES.map((capability) =>
            Effect.map(entitlements.has(principal.profileId, capability), (has) =>
              has ? capability : undefined,
            ),
          ),
        );
        return { profile, capabilities: held.filter((c) => c !== undefined) };
      }),
    )
    .handle("setProfile", ({ payload }) =>
      Effect.gen(function* () {
        const profiles = yield* Profiles;
        const principal = yield* CurrentPrincipal;
        return yield* profiles.set(principal.profileId, payload);
      }),
    )
    /**
     * A caller that knows how the question was asked says so; a person typing
     * an answer directly does not, and free text is what they are giving.
     * The label falls back to the question key for the same reason — better a
     * machine-readable stand-in than an invented sentence.
     */
    .handle("setAnswer", ({ params, payload }) =>
      Effect.gen(function* () {
        const profiles = yield* Profiles;
        const principal = yield* CurrentPrincipal;
        const question = decodeQuestionKey(params.question);
        yield* profiles.answer(principal.profileId, question, payload.value, {
          label: payload.label ?? params.question,
          shape: payload.shape ?? { _tag: "Text" },
        });
        return { question: params.question };
      }),
    )
    .handle("exportProfile", () =>
      Effect.gen(function* () {
        const profiles = yield* Profiles;
        const savedJobs = yield* SavedJobs;
        const applications = yield* Applications;
        const principal = yield* CurrentPrincipal;
        const profile = yield* profiles.get(principal.profileId);
        const saved = yield* savedJobs.list(principal.profileId);
        const prepared = yield* applications.history(principal.profileId);
        return {
          json: toJson(profile),
          markdown: toMarkdown(profile),
          history: {
            json: historyToJson(saved, prepared),
            markdown: historyToMarkdown(saved, prepared),
          },
        };
      }),
    )
    .handle("importProfile", ({ payload }) =>
      Effect.gen(function* () {
        const profiles = yield* Profiles;
        const principal = yield* CurrentPrincipal;
        const profile = yield* Effect.try({
          try: () => fromJson(payload.json),
          catch: (error) => new InvalidProfileJson({ message: describeImportFailure(error) }),
        });
        return yield* profiles.set(principal.profileId, profile);
      }),
    ),
);
