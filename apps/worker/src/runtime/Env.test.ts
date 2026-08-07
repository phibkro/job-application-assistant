import { describe, expect, it } from "vitest";
import { EnvironmentIncomplete, decodeEnv } from "./Env.ts";

const binding = { prepare: () => undefined, batch: () => undefined };

describe("decodeEnv", () => {
  it("names what is missing, because a wrongly wired deploy must say so on its first request", () => {
    expect(() => decodeEnv({ ENVIRONMENT: "staging" })).toThrowError(EnvironmentIncomplete);
    try {
      decodeEnv({ ENVIRONMENT: "staging" });
    } catch (error) {
      expect((error as EnvironmentIncomplete).message).toContain("DB");
    }
  });

  it("rejects a binding that is present but not a database", () => {
    // What an undeclared binding looks like once something else fills the slot:
    // truthy, wrong, and silent until the first query.
    expect(() => decodeEnv({ DB: {}, ENVIRONMENT: "staging" })).toThrowError(EnvironmentIncomplete);
  });

  it("rejects a blank environment name rather than reporting one", () => {
    expect(() => decodeEnv({ DB: binding, ENVIRONMENT: "  " })).toThrowError(EnvironmentIncomplete);
  });

  it("accepts a complete environment", () => {
    expect(decodeEnv({ DB: binding, ENVIRONMENT: "staging" }).ENVIRONMENT).toBe("staging");
  });
});
