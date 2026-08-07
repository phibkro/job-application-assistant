import * as Match from "effect/Match";
import type { HtmlBuilder, Html } from "foldkit/html";
import {
  Navigated,
  SessionCleared,
  SessionTokenInputChanged,
  SessionTokenSubmitted,
} from "../Message.ts";
import type { Message } from "../Message.ts";
import { PageBrowse, PageFeed, PageProfile } from "../Model.ts";
import type { Model, Problem } from "../Model.ts";

/**
 * Renders any `Problem` without a stack trace in sight.
 *
 * `UpgradeRequired` (the 402 case) gets the most attention: a premium
 * refusal is a normal, expected outcome of trying a capability the account
 * does not have, not an error state, so it explains what upgrading buys
 * instead of reading like a failure.
 */
export const renderProblem = (problem: Problem, h: HtmlBuilder<Message>): Html =>
  Match.value(problem).pipe(
    Match.tag("Unauthorized", ({ message }) =>
      h.div(
        [h.Class("problem problem-auth")],
        [
          h.p([], ["Sign in required."]),
          h.p([], [message || "Enter a session token above to continue."]),
        ],
      ),
    ),
    Match.tag("NotFound", ({ message }) => h.div([h.Class("problem")], [h.p([], [message])])),
    Match.tag("UpgradeRequired", ({ capability }) =>
      h.div(
        [h.Class("problem problem-upgrade")],
        [
          h.p([], [h.strong([], [`This needs the "${capability}" capability.`])]),
          h.p(
            [],
            [
              "Your current plan does not include it. Upgrading unlocks it for every job, not just this one.",
            ],
          ),
        ],
      ),
    ),
    Match.tag("ForbiddenByPlatform", ({ platform, policy }) =>
      h.div(
        [h.Class("problem problem-forbidden")],
        [h.p([], [`${platform} does not allow this: ${policy}.`])],
      ),
    ),
    Match.tag("NetworkError", ({ detail }) =>
      h.div([h.Class("problem")], [h.p([], [`Request failed: ${detail}`])]),
    ),
    Match.exhaustive,
  );

export const nav = (h: HtmlBuilder<Message>): Html =>
  h.nav(
    [h.Class("nav")],
    [
      h.button([h.OnClick(Navigated({ to: PageBrowse() }))], ["Browse"]),
      h.button([h.OnClick(Navigated({ to: PageFeed() }))], ["Fresh feed"]),
      h.button([h.OnClick(Navigated({ to: PageProfile() }))], ["Profile"]),
    ],
  );

/**
 * The session entry point. There is no login flow in this contract — an
 * account presents a session token or API key it already holds (see
 * `Accounts.authenticate` in the worker) — so this is a paste box, not a
 * form. The token never touches `localStorage`; `SessionTokenSubmitted` and
 * `SessionCleared` are the only two Messages that change it, and both route
 * through a Command that writes `sessionStorage` (see `Session.ts`).
 */
export const sessionPanel = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class("session-panel")],
    model.session._tag === "Authenticated"
      ? [h.span([], ["Signed in."]), h.button([h.OnClick(SessionCleared())], ["Clear session"])]
      : [
          h.input([
            h.Type("password"),
            h.Value(model.sessionTokenInput),
            h.Placeholder("Session token or API key"),
            h.OnInput((value) => SessionTokenInputChanged({ value })),
          ]),
          h.button([h.OnClick(SessionTokenSubmitted())], ["Use token"]),
        ],
  );
