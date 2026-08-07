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
import { renderProblem } from "./Shared.ts";

const statusLabel = (job: CanonicalJob): string =>
  job.status._tag === "Active" ? "Active" : `Closed ${job.status.closedAt}`;

const jobBody = (job: CanonicalJob, h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      h.h2([], [job.title]),
      h.p([], [`${job.employerName} — ${job.location} — ${statusLabel(job)}`]),
      job.deadline === undefined ? h.empty : h.p([], [`Deadline: ${job.deadline}`]),
      h.p([h.Class("job-description")], [job.description]),
      h.a(
        [h.Href(job.applicationUrl), h.Target("_blank"), h.Rel("noopener")],
        ["Original listing ↗"],
      ),
    ],
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
    [h.Class("prepare-controls")],
    [
      h.button(
        [
          h.Disabled(disabled),
          h.OnClick(PrepareRequested({ jobId, savedJobId, method: Option.none() })),
        ],
        ["Prepare application"],
      ),
      h.button(
        [
          h.Disabled(disabled),
          h.OnClick(PrepareRequested({ jobId, savedJobId, method: Option.some("automated") })),
        ],
        ["Prepare (automated)"],
      ),
      h.button(
        [
          h.Disabled(disabled),
          h.OnClick(PrepareRequested({ jobId, savedJobId, method: Option.some("assisted") })),
        ],
        ["Prepare (assisted)"],
      ),
    ],
  );

const draftPreview = (cv: string, letter: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class("draft-preview")],
    [
      h.p([], [h.strong([], ["CV draft"])]),
      h.pre([], [cv]),
      h.p([], [h.strong([], ["Letter draft"])]),
      h.pre([], [letter]),
    ],
  );

const decisionControls = (
  jobId: string,
  applicationId: string,
  disabled: boolean,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Class("decision-controls")],
    [
      h.button(
        [
          h.Disabled(disabled),
          h.OnClick(DecisionRequested({ jobId, applicationId, decision: "Approve" })),
        ],
        ["Approve"],
      ),
      h.button(
        [
          h.Disabled(disabled),
          h.OnClick(DecisionRequested({ jobId, applicationId, decision: "Rework" })),
        ],
        ["Rework"],
      ),
      h.button(
        [
          h.Disabled(disabled),
          h.OnClick(DecisionRequested({ jobId, applicationId, decision: "Decline" })),
        ],
        ["Decline"],
      ),
    ],
  );

/** A `method` that does not match what was requested is a good outcome
 *  (the platform's automation policy stopped an automatic submission the
 *  server would have refused outright otherwise) — so it gets its own,
 *  clearly-labelled callout with the platform and the reason, never a
 *  silently-swapped value the person has to notice on their own. */
const downgradeNotice = (
  applicationUrl: string,
  method: string,
  reason: string,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [h.Class("downgrade-notice")],
    [
      h.p([], [h.strong([], [`Prepared as "${method}" instead of what was requested.`])]),
      h.p([], [reason]),
      h.p(
        [],
        [
          "Apply at: ",
          h.a([h.Href(applicationUrl), h.Target("_blank"), h.Rel("noopener")], [applicationUrl]),
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
        h.div(
          [h.Class("apply-stage")],
          [
            h.p([], ["Shortlisted."]),
            h.button(
              [
                h.Disabled(disabled),
                h.OnClick(DraftRequested({ jobId, savedJobId: saved.savedJobId })),
              ],
              [disabled ? "Drafting…" : "Draft CV & letter"],
            ),
          ],
        ),
      Drafted: (drafted) =>
        h.div(
          [h.Class("apply-stage")],
          [
            h.p([], [`Draft ready (generator: ${drafted.generator}).`]),
            draftPreview(drafted.cv, drafted.letter, h),
            prepareControls(jobId, drafted.savedJobId, disabled, h),
          ],
        ),
      Prepared: (prepared) =>
        h.div(
          [h.Class("apply-stage")],
          [
            prepared.downgradeReason === null
              ? h.p([], [`Prepared via "${prepared.method}". Ready to decide.`])
              : downgradeNotice(
                  prepared.applicationUrl,
                  prepared.method,
                  prepared.downgradeReason,
                  h,
                ),
            draftPreview(prepared.cv, prepared.letter, h),
            decisionControls(jobId, prepared.applicationId, disabled, h),
          ],
        ),
      Decided: (decided) =>
        h.div(
          [h.Class("apply-stage")],
          [
            decided.downgradeReason === null
              ? h.empty
              : downgradeNotice(decided.applicationUrl, decided.method, decided.downgradeReason, h),
            h.p([], [`Decision recorded: ${decided.status}.`]),
          ],
        ),
    }),
  );
};

const applyFlow = (model: Model, job: CanonicalJob, h: HtmlBuilder<Message>): Html => {
  if (model.session._tag === "Anonymous") {
    return h.p([h.Class("hint")], ["Enter a session token above to shortlist, draft, or apply."]);
  }
  const record = Applications.find(model.applications, job.id);
  const pending: RequestStatus = Option.match(record, {
    onNone: () => RequestIdle(),
    onSome: (r) => r.pending,
  });
  const stage = Option.flatMap(record, (r) => r.stage);

  return h.div(
    [h.Class("apply-flow")],
    [
      pending._tag === "Failed" ? renderProblem(pending.problem, h) : h.empty,
      Option.match(stage, {
        onNone: () =>
          h.button(
            [h.Disabled(pending._tag === "Pending"), h.OnClick(SaveJobClicked({ jobId: job.id }))],
            [pending._tag === "Pending" ? "Shortlisting…" : "Shortlist this job"],
          ),
        onSome: (s) => stageView(job.id, s, pending, h),
      }),
    ],
  );
};

export const jobDetailView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class("page")],
    [
      AsyncData.matchDataSplitEmpty(model.jobDetail, {
        onIdle: () => h.p([], ["No job selected."]),
        onLoading: () => h.p([], ["Loading job…"]),
        onFailure: (problem) => renderProblem(problem, h),
        onData: (job) => h.div([], [jobBody(job, h), applyFlow(model, job, h)]),
      }),
    ],
  );
