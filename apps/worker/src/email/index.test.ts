import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { Email } from "../services/Email.ts";
import { layerBinding, makeRecording } from "./index.ts";
import type { SendEmailBinding } from "./index.ts";

const send = (to: string) =>
  Effect.gen(function* () {
    const email = yield* Email;
    yield* email.send({ to, subject: "Confirm your address", text: "Follow the link." });
  });

describe("the real binding", () => {
  it("passes the message through with the configured sender", async () => {
    const seen: Array<unknown> = [];
    const binding: SendEmailBinding = {
      send: async (message) => {
        seen.push(message);
      },
    };
    await Effect.runPromise(
      Effect.provide(send("someone@example.com"), layerBinding(binding, "noreply@phibkro.org")),
    );
    expect(seen[0]).toMatchObject({
      to: "someone@example.com",
      from: "noreply@phibkro.org",
      subject: "Confirm your address",
    });
  });

  it("reports an unverified recipient as its own failure, not a generic one", async () => {
    // What the free plan returns for anyone who is not a verified destination.
    // A registration blocked by billing must be distinguishable from a bug.
    const binding: SendEmailBinding = {
      send: () =>
        Promise.reject(new Error("E_RECIPIENT_NOT_ALLOWED: Recipient not in allowed list")),
    };
    const exit = await Effect.runPromiseExit(
      Effect.provide(send("stranger@example.com"), layerBinding(binding, "noreply@phibkro.org")),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(JSON.stringify(exit)).toContain("RecipientNotAllowed");
  });

  it("keeps every other rejection distinct, carrying what the platform said", async () => {
    const binding: SendEmailBinding = {
      send: () => Promise.reject(new Error("E_SENDER_NOT_VERIFIED: Sender domain not verified")),
    };
    const exit = await Effect.runPromiseExit(
      Effect.provide(send("someone@example.com"), layerBinding(binding, "noreply@nope.invalid")),
    );
    expect(JSON.stringify(exit)).toContain("EmailRejected");
    expect(JSON.stringify(exit)).toContain("E_SENDER_NOT_VERIFIED");
  });
});

describe("the recording sender", () => {
  it("records what would have gone, so a caller can be tested without a binding", async () => {
    const recording = makeRecording();
    await Effect.runPromise(Effect.provide(send("someone@example.com"), recording.layer));
    expect(recording.sent).toHaveLength(1);
    expect(recording.sent[0]?.subject).toBe("Confirm your address");
  });
});
