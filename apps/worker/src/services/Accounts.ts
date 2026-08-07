import type * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import type { Credential } from "@job-index/domain/Access";
import type { Profile } from "@job-index/domain/Profile";
import type { Answer, AnswerShape, QuestionKey } from "@job-index/domain/Answer";
import type { ProfileId } from "@job-index/domain/Ids";

/**
 * Identity, and the profile it carries.
 *
 * One principal, two credential kinds: an API key for programs, a session for
 * browsers and chat. Both resolve here, so authorization is written once.
 */
export class Accounts extends Context.Service<
  Accounts,
  {
    readonly authenticate: (presented: string) => Effect.Effect<Credential | undefined>;
    readonly profileOf: (credential: Credential) => Effect.Effect<ProfileId | undefined>;
    /** Erasure marks immediately and blocks access; the purge sweep follows. */
    readonly requestErasure: (profile: ProfileId) => Effect.Effect<void>;
  }
>()("@job-index/Accounts") {}

/**
 * The CV and the answers it is made of.
 *
 * Answers are the unit an application is enriched from: a CV renders them, a
 * letter cites them, and a form is filled from them. Storing the rendering
 * instead is what makes a person retype their notice period into every portal.
 */
export class Profiles extends Context.Service<
  Profiles,
  {
    readonly get: (profile: ProfileId) => Effect.Effect<Profile>;
    readonly set: (profile: ProfileId, value: Profile) => Effect.Effect<Profile>;
    readonly answers: (profile: ProfileId) => Effect.Effect<ReadonlyArray<Answer>>;
    /**
     * Records an answer.
     *
     * Carries the label and shape because `Answer` requires them and there is
     * no catalogue to look them up in: the questions come from whatever form a
     * platform happens to ask. Without them an implementation has to invent
     * both, which is how a free-text question quietly becomes a text field
     * forever — the drafting slot reported exactly that.
     */
    readonly answer: (
      profile: ProfileId,
      question: QuestionKey,
      value: string,
      asked: { readonly label: string; readonly shape: AnswerShape },
    ) => Effect.Effect<void>;
    /** Questions a form asked that this profile cannot yet answer. */
    readonly unanswered: (
      profile: ProfileId,
      asked: ReadonlyArray<QuestionKey>,
    ) => Effect.Effect<ReadonlyArray<QuestionKey>>;
  }
>()("@job-index/Profiles") {}
