import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { Accounts } from "../services/Accounts.ts";
import { Authenticated, CurrentPrincipal, Unauthorized } from "../Api.ts";

/**
 * The one bearer-token check every guarded group goes through.
 *
 * `Accounts.authenticate` already collapses "unknown", "revoked", and
 * "expired" into a single `undefined` (see `accounts/accounts.ts`:
 * `findValidSession`/`findValidPrincipal` reject all three before a row comes
 * back), so this middleware has exactly two failure points: no credential
 * resolves, or the credential's profile has been erased. Either way the
 * caller gets the same `Unauthorized` — which of the two happened is not
 * information a failed request should leak.
 */
export const layer = Layer.effect(
  Authenticated,
  Effect.gen(function* () {
    const accounts = yield* Accounts;

    return Authenticated.of({
      session: (httpEffect, { credential }) =>
        Effect.gen(function* () {
          const presented = Redacted.value(credential);
          const resolved = yield* accounts.authenticate(presented);
          if (resolved === undefined) {
            return yield* Effect.fail(
              new Unauthorized({ message: "unknown, revoked, or expired token" }),
            );
          }

          const profileId = yield* accounts.profileOf(resolved);
          if (profileId === undefined) {
            return yield* Effect.fail(
              new Unauthorized({ message: "credential has no active profile" }),
            );
          }

          const principal = CurrentPrincipal.of({ principalId: resolved.principal, profileId });
          return yield* Effect.provideService(httpEffect, CurrentPrincipal, principal);
        }),
    });
  }),
);
