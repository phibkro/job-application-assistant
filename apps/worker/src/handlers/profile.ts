import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import { QuestionKey } from "@job-index/domain/Answer";
import { api, CurrentPrincipal } from "../Api.ts";
import { Profiles } from "../services/Accounts.ts";
import { Entitlements, type Capability } from "../services/Entitlements.ts";

const decodeQuestionKey = Schema.decodeUnknownSync(QuestionKey);

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
     * `Profiles.answer` requires `asked: { label, shape }`; the wire payload
     * carries only `value` and an optional `label` (see `Api.ts`), with no
     * way to say whether the answer is free text, a number, a date, or a
     * choice. `AnswerShape` drives how a form gets filled from this answer
     * later, so defaulting it to `Text` is a real loss of information the
     * wire endpoint has no field to recover — flagged in the handoff report.
     */
    .handle("setAnswer", ({ params, payload }) =>
      Effect.gen(function* () {
        const profiles = yield* Profiles;
        const principal = yield* CurrentPrincipal;
        const question = decodeQuestionKey(params.question);
        yield* profiles.answer(principal.profileId, question, payload.value, {
          label: payload.label ?? params.question,
          shape: { _tag: "Text" },
        });
        return { question: params.question };
      }),
    ),
);
