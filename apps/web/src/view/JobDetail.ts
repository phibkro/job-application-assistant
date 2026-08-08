import * as Match from "effect/Match";
import * as Option from "effect/Option";
import { AsyncData } from "foldkit";
import type { HtmlBuilder, Html } from "foldkit/html";
import type { CanonicalJob } from "@job-index/domain/Job";
import { DecisionRequested, DraftRequested, PrepareRequested, SaveJobClicked } from "../Message.ts";
import type { Message } from "../Message.ts";
import * as Applications from "../Applications.ts";
import { RequestIdle } from "../Model.ts";
import type { ApplyStage, Model, RequestStatus } from "../Model.ts";
import { button, card, pageClass, renderProblem } from "./Shared.ts";

const statusLabel = (job: CanonicalJob): string =>
  job.status._tag === "Active" ? "Active" : `Closed ${job.status.closedAt}`;

/**
 * The description slot, for a job that may not have one yet.
 *
 * Deliberately not a blank space and not the word "Loading…" either: an
 * unhydrated vacancy is not still loading in the ordinary sense (the page
 * finished; there is just no detail on file yet), and the design spec is
 * explicit that this must not "look like an advert with no description".
 * `getJob` already tried to hydrate it once by the time this renders (see
 * `handlers/corpus.ts`), so if it's still unhydrated here the fetch itself
 * came back empty — the original listing link below is the honest fallback,
 * not a description this page does not have.
 */
const descriptionBody = (job: CanonicalJob, h: HtmlBuilder<Message>): Html =>
  job.hydration._tag === "Hydrated"
    ? h.p([h.Class("mt-4 whitespace-pre-wrap text-sm text-gray-700")], [job.hydration.description])
    : h.div(
        [h.Class("mt-4 rounded-md border border-dashed border-gray-300 bg-gray-50 p-4")],
        [
          h.p(
            [h.Class("text-sm text-gray-600")],
            [
              "The full description isn't available from this source right now. ",
              "The original listing (below) has it.",
            ],
          ),
        ],
      );

const jobBody = (job: CanonicalJob, h: HtmlBuilder<Message>): Html =>
  card(
    [
      h.h2([h.Class("text-xl font-semibold text-gray-900")], [job.title]),
      h.p(
        [h.Class("mt-1 text-sm text-gray-500")],
        [`${job.employerName} — ${job.location} — ${statusLabel(job)}`],
      ),
      job.hydration._tag === "Hydrated" && job.hydration.deadline !== undefined
        ? h.p([h.Class("mt-1 text-sm text-gray-500")], [`Deadline: ${job.hydration.deadline}`])
        : h.empty,
      descriptionBody(job, h),
      h.a(
        [
          h.Href(job.applicationUrl),
          h.Target("_blank"),
          h.Rel("noopener"),
          h.Class("mt-4 inline-block text-sm font-medium text-indigo-700 hover:text-indigo-900"),
        ],
        ["Original listing ↗"],
      ),
    ],
    h,
  );

/** Renders the four Prepare buttons' worth of choice as three: default,
 *  automated, assisted. Each is a distinct `method` value the server may
 *  still downgrade — see `Prepared`'s `downgradeReason`. */
const prepareControls = (
  jobId: string,
  savedJobId: string,
  disabled: boolean,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Class("flex flex-wrap gap-2")],
    [
      button(
        {
          label: "Prepare application",
          isDisabled: disabled,
          onClick: PrepareRequested({ jobId, savedJobId, method: Option.none() }),
        },
        h,
      ),
      button(
        {
          label: "Prepare (automated)",
          variant: "secondary",
          isDisabled: disabled,
          onClick: PrepareRequested({ jobId, savedJobId, method: Option.some("automated") }),
        },
        h,
      ),
      button(
        {
          label: "Prepare (assisted)",
          variant: "secondary",
          isDisabled: disabled,
          onClick: PrepareRequested({ jobId, savedJobId, method: Option.some("assisted") }),
        },
        h,
      ),
    ],
  );

const draftPreview = (cv: string, letter: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class("grid gap-4 sm:grid-cols-2")],
    [
      h.div(
        [],
        [
          h.p([h.Class("text-sm font-semibold text-gray-900")], ["CV draft"]),
          h.pre(
            [
              h.Class(
                "mt-1 max-h-64 overflow-auto rounded-md bg-gray-50 p-3 text-xs text-gray-700",
              ),
            ],
            [cv],
          ),
        ],
      ),
      h.div(
        [],
        [
          h.p([h.Class("text-sm font-semibold text-gray-900")], ["Letter draft"]),
          h.pre(
            [
              h.Class(
                "mt-1 max-h-64 overflow-auto rounded-md bg-gray-50 p-3 text-xs text-gray-700",
              ),
            ],
            [letter],
          ),
        ],
      ),
    ],
  );

const decisionControls = (
  jobId: string,
  applicationId: string,
  disabled: boolean,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Class("flex flex-wrap gap-2")],
    [
      button(
        {
          label: "Approve",
          variant: "success",
          isDisabled: disabled,
          onClick: DecisionRequested({ jobId, applicationId, decision: "Approve" }),
        },
        h,
      ),
      // Rework and Decline are both legitimate decisions, not failures — a
      // cautionary amber and a neutral gray, never the red `renderProblem`
      // reserves for an actual `Problem`.
      button(
        {
          label: "Rework",
          variant: "warning",
          isDisabled: disabled,
          onClick: DecisionRequested({ jobId, applicationId, decision: "Rework" }),
        },
        h,
      ),
      button(
        {
          label: "Decline",
          variant: "secondary",
          isDisabled: disabled,
          onClick: DecisionRequested({ jobId, applicationId, decision: "Decline" }),
        },
        h,
      ),
    ],
  );

/** A `method` that does not match what was requested is a good outcome
 *  (the platform's automation policy stopped an automatic submission the
 *  server would have refused outright otherwise) — so it gets its own,
 *  clearly-labelled callout with the platform and the reason, never a
 *  silently-swapped value the person has to notice on their own. The
 *  platform name is part of `reason`'s own text (see `Applications.Prepared`
 *  in the worker), so surfacing `reason` prominently surfaces the platform. */
const downgradeNotice = (
  applicationUrl: string,
  method: string,
  reason: string,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Class("rounded-lg border border-amber-300 bg-amber-50 p-4")],
    [
      h.p(
        [h.Class("text-sm font-semibold text-amber-900")],
        [`Prepared as "${method}" instead of what was requested.`],
      ),
      h.p([h.Class("mt-1 text-sm text-amber-800")], [reason]),
      h.p(
        [h.Class("mt-2 text-sm text-amber-800")],
        [
          "Apply at: ",
          h.a(
            [h.Href(applicationUrl), h.Target("_blank"), h.Rel("noopener"), h.Class("underline")],
            [applicationUrl],
          ),
        ],
      ),
    ],
  );

/** Matched exhaustively: a fifth `ApplyStage` variant with no branch here
 *  fails `bun run typecheck` rather than silently rendering nothing. */
const stageView = (
  jobId: string,
  stage: ApplyStage,
  pending: RequestStatus,
  h: HtmlBuilder<Message>,
): Html => {
  const disabled = pending._tag === "Pending";
  return Match.value(stage).pipe(
    Match.withReturnType<Html>(),
    Match.tagsExhaustive({
      Saved: (saved) =>
        card(
          [
            h.p([h.Class("text-sm text-gray-700")], ["Shortlisted."]),
            h.div(
              [h.Class("mt-3")],
              [
                button(
                  {
                    label: disabled ? "Drafting…" : "Draft CV & letter",
                    isDisabled: disabled,
                    onClick: DraftRequested({ jobId, savedJobId: saved.savedJobId }),
                  },
                  h,
                ),
              ],
            ),
          ],
          h,
        ),
      Drafted: (drafted) =>
        card(
          [
            h.p(
              [h.Class("text-sm text-gray-700")],
              [`Draft ready (generator: ${drafted.generator}).`],
            ),
            h.div([h.Class("mt-3")], [draftPreview(drafted.cv, drafted.letter, h)]),
            h.div([h.Class("mt-4")], [prepareControls(jobId, drafted.savedJobId, disabled, h)]),
          ],
          h,
        ),
      Prepared: (prepared) =>
        card(
          [
            prepared.downgradeReason === null
              ? h.p(
                  [h.Class("text-sm text-gray-700")],
                  [`Prepared via "${prepared.method}". Ready to decide.`],
                )
              : downgradeNotice(
                  prepared.applicationUrl,
                  prepared.method,
                  prepared.downgradeReason,
                  h,
                ),
            h.div([h.Class("mt-3")], [draftPreview(prepared.cv, prepared.letter, h)]),
            h.div(
              [h.Class("mt-4")],
              [decisionControls(jobId, prepared.applicationId, disabled, h)],
            ),
          ],
          h,
        ),
      Decided: (decided) =>
        card(
          [
            decided.downgradeReason === null
              ? h.empty
              : downgradeNotice(decided.applicationUrl, decided.method, decided.downgradeReason, h),
            h.p(
              [
                h.Class(
                  decided.downgradeReason === null
                    ? "text-sm text-gray-700"
                    : "mt-3 text-sm text-gray-700",
                ),
              ],
              [`Decision recorded: ${decided.status}.`],
            ),
          ],
          h,
        ),
    }),
  );
};

const applyFlow = (model: Model, job: CanonicalJob, h: HtmlBuilder<Message>): Html => {
  if (model.session._tag === "Anonymous") {
    return h.p(
      [h.Class("text-sm text-gray-500")],
      ["Enter a session token above to shortlist, draft, or apply."],
    );
  }
  const record = Applications.find(model.applications, job.id);
  const pending: RequestStatus = Option.match(record, {
    onNone: () => RequestIdle(),
    onSome: (r) => r.pending,
  });
  const stage = Option.flatMap(record, (r) => r.stage);

  return h.div(
    [h.Class("space-y-4")],
    [
      pending._tag === "Failed" ? renderProblem(pending.problem, h) : h.empty,
      Option.match(stage, {
        onNone: () =>
          button(
            {
              label: pending._tag === "Pending" ? "Shortlisting…" : "Shortlist this job",
              isDisabled: pending._tag === "Pending",
              onClick: SaveJobClicked({ jobId: job.id }),
            },
            h,
          ),
        onSome: (s) => stageView(job.id, s, pending, h),
      }),
    ],
  );
};

export const jobDetailView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class(pageClass)],
    [
      AsyncData.matchDataSplitEmpty(model.jobDetail, {
        onIdle: () => h.p([h.Class("text-sm text-gray-500")], ["No job selected."]),
        onLoading: () => h.p([h.Class("text-sm text-gray-500")], ["Loading job…"]),
        onFailure: (problem) => renderProblem(problem, h),
        onData: (job) => h.div([h.Class("space-y-6")], [jobBody(job, h), applyFlow(model, job, h)]),
      }),
    ],
  );
