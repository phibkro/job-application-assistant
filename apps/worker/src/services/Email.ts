import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Data from "effect/Data";

/**
 * One message, addressed and ready to send.
 *
 * Plain text is required and HTML is not, in that order deliberately: every
 * client renders text, a verification link that only exists inside an HTML
 * body is a link some people cannot use, and a text part is what keeps a
 * message out of a spam folder that distrusts HTML-only mail.
 */
export interface Message {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

/**
 * Why a message did not go.
 *
 * `RecipientNotAllowed` is its own case rather than a generic failure because
 * it is the one this deployment will actually hit: Cloudflare permits sending
 * to verified addresses on any plan, and to arbitrary recipients only on the
 * paid one. A registration that fails for that reason is a billing state, not
 * a bug, and the caller has to be able to tell the difference — telling
 * someone "sign-up failed" when the truth is "this account cannot yet mail
 * strangers" wastes everybody's afternoon.
 */
export class EmailRejected extends Data.TaggedError("EmailRejected")<{
  readonly to: string;
  readonly reason: string;
}> {}

export class RecipientNotAllowed extends Data.TaggedError("RecipientNotAllowed")<{
  readonly to: string;
}> {}

/**
 * Sending mail, without the sender knowing who carries it.
 *
 * A port rather than a direct call to the binding, for a reason that is about
 * plans rather than taste: outbound mail to arbitrary recipients requires a
 * paid Workers plan, so until that is bought, the real binding can only reach
 * verified addresses. Behind this tag, that difference is one layer swap
 * instead of a branch in every caller — and the same seam lets a test assert
 * what would have been sent without sending it.
 */
export class Email extends Context.Service<
  Email,
  {
    readonly send: (message: Message) => Effect.Effect<void, EmailRejected | RecipientNotAllowed>;
  }
>()("@job-index/Email") {}
