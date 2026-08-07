import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Email, EmailRejected, RecipientNotAllowed } from "../services/Email.ts";
import type { Message } from "../services/Email.ts";

/**
 * The Cloudflare `send_email` binding, as the Workers runtime exposes it.
 *
 * Declared here rather than imported: the platform's own types are not in this
 * workspace, and this is the whole surface we use.
 */
export interface SendEmailBinding {
  readonly send: (message: {
    readonly to: string;
    readonly from: string;
    readonly subject: string;
    readonly text: string;
    readonly html?: string;
  }) => Promise<unknown>;
}

/**
 * Cloudflare's rejections arrive as message text with a code in it. Matching
 * on the code rather than the prose is the difference between a check that
 * survives a wording change and one that does not.
 */
const rejectionOf = (to: string, cause: unknown): EmailRejected | RecipientNotAllowed => {
  const text = cause instanceof Error ? cause.message : String(cause);
  return text.includes("E_RECIPIENT_NOT_ALLOWED")
    ? new RecipientNotAllowed({ to })
    : new EmailRejected({ to, reason: text });
};

/**
 * Mail through the real binding.
 *
 * On the free plan this reaches verified destination addresses only, and an
 * unverified recipient comes back as `RecipientNotAllowed` — which is exactly
 * how we can exercise this path for real before anyone pays for anything. The
 * code that runs against a stranger's address on the paid plan is this same
 * code; what changes is who Cloudflare lets it reach.
 */
export const layerBinding = (binding: SendEmailBinding, from: string): Layer.Layer<Email> =>
  Layer.succeed(Email, {
    send: (message: Message) =>
      Effect.tryPromise({
        try: () =>
          binding.send({
            to: message.to,
            from,
            subject: message.subject,
            text: message.text,
            ...(message.html === undefined ? {} : { html: message.html }),
          }),
        catch: (cause) => rejectionOf(message.to, cause),
      }).pipe(Effect.asVoid),
  });

/**
 * Mail that goes nowhere, and says so.
 *
 * For a deployment with no binding — and for tests, which read `sent` to
 * assert what would have been delivered. It logs rather than discarding
 * silently: a verification message nobody received should be findable in the
 * logs of the deployment that failed to send it, not merely absent.
 */
export const makeRecording = (): {
  readonly layer: Layer.Layer<Email>;
  readonly sent: Array<Message>;
} => {
  const sent: Array<Message> = [];
  return {
    sent,
    layer: Layer.succeed(Email, {
      send: (message: Message) =>
        Effect.sync(() => {
          sent.push(message);
        }).pipe(
          Effect.tap(() =>
            Effect.logInfo("email not sent: no binding configured").pipe(
              Effect.annotateLogs({ to: message.to, subject: message.subject }),
            ),
          ),
          Effect.asVoid,
        ),
    }),
  };
};
