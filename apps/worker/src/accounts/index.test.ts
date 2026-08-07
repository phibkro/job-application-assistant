import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { PrincipalId, ProfileId } from "@job-index/domain/Ids";
import { Accounts, Profiles } from "../services/Accounts.ts";
import { layer } from "./index.ts";
import { emptyState, fakeDatabaseLayer } from "./fixtures.ts";

describe("layer", () => {
  it("provides both Accounts and Profiles from one Database dependency", async () => {
    const profileId = Schema.decodeUnknownSync(ProfileId)("profile-1");
    const state = emptyState();

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        const profiles = yield* Profiles;
        const resolved = yield* accounts.profileOf({
          _tag: "ApiKey",
          principal: Schema.decodeUnknownSync(PrincipalId)("no-such-principal"),
        });
        const cv = yield* profiles.get(profileId);
        return { resolved, cv };
      }).pipe(Effect.provide(layer), Effect.provide(fakeDatabaseLayer(state))),
    );

    expect(result.resolved).toBeUndefined();
    expect(result.cv.headline).toBe("");
  });
});
