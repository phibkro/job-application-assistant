import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ProfileIncomplete } from "@job-index/domain/Failure";
import { Drafting } from "../services/Drafting.ts";
import { composeCv } from "./composeCv.ts";
import { composeLetter } from "./composeLetter.ts";

/**
 * The deterministic composer: available to every account, no model call
 * involved. `generator` is the literal `"template"` so a caller — and a
 * test — can tell which implementation of `Drafting` answered without
 * inspecting the prose.
 *
 * The one thing this layer decides that the pure composers do not: whether
 * there is enough profile to draft from at all. A profile with neither a
 * headline nor any experience has nothing for `composeCv`/`composeLetter` to
 * work with, so drafting is refused rather than handed back an empty
 * document that looks like a bug.
 */
export const layer = Layer.succeed(Drafting, {
  compose: (profile, job) =>
    profile.headline.trim() === "" && profile.experience.length === 0
      ? Effect.fail(new ProfileIncomplete({ missing: "headline or experience" }))
      : Effect.succeed({
          cv: composeCv(profile, job),
          letter: composeLetter(profile, job),
          generator: "template" as const,
        }),
});
