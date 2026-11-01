import { describe, expect, it } from "vitest";
import { EnvironmentIncomplete, decodeEnv } from "./Env.ts";

const binding = { prepare: () => undefined, batch: () => undefined };
const sourceLease = { idFromName: () => undefined, get: () => undefined };

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
    expect(() =>
      decodeEnv({ DB: {}, SOURCE_LEASE: sourceLease, ENVIRONMENT: "staging" }),
    ).toThrowError(EnvironmentIncomplete);
  });

  it("names a missing Durable Object namespace binding", () => {
    expect(() => decodeEnv({ DB: binding, ENVIRONMENT: "staging" })).toThrowError(
      EnvironmentIncomplete,
    );
    try {
      decodeEnv({ DB: binding, ENVIRONMENT: "staging" });
    } catch (error) {
      expect((error as EnvironmentIncomplete).message).toContain("SOURCE_LEASE");
    }
  });

  it("rejects a blank environment name rather than reporting one", () => {
    expect(() =>
      decodeEnv({ DB: binding, SOURCE_LEASE: sourceLease, ENVIRONMENT: "  " }),
    ).toThrowError(EnvironmentIncomplete);
  });

  it("accepts a complete environment", () => {
    const decoded = decodeEnv({ DB: binding, SOURCE_LEASE: sourceLease, ENVIRONMENT: "staging" });
    expect(decoded.ENVIRONMENT).toBe("staging");
    // The documented default: attempt at most once per six hours.
    expect(decoded.INGESTION_ATTEMPT_FLOOR_MS).toBe(21_600_000);
  });

  it("keeps a valid lazy-ingestion floor override", () => {
    const decoded = decodeEnv({
      DB: binding,
      SOURCE_LEASE: sourceLease,
      ENVIRONMENT: "staging",
      INGESTION_ATTEMPT_FLOOR_MS: "3600000",
    });
    expect(decoded.INGESTION_ATTEMPT_FLOOR_MS).toBe(3_600_000);
  });

  it.each(["0", "-1", "1.5", "six-hours", ""])(
    "fails loud on a malformed lazy-ingestion floor override (%j)",
    (floor) => {
      try {
        decodeEnv({
          DB: binding,
          SOURCE_LEASE: sourceLease,
          ENVIRONMENT: "staging",
          INGESTION_ATTEMPT_FLOOR_MS: floor,
        });
        expect.unreachable("decodeEnv should have thrown");
      } catch (error) {
        expect((error as EnvironmentIncomplete).message).toContain("INGESTION_ATTEMPT_FLOOR_MS");
      }
    },
  );

  // WS-0022: bounded hydration per run is an Effect `Config` with a provisional default (L4).
  it("defaults bounded hydration to the provisional 5 detail fetches per run", () => {
    const decoded = decodeEnv({ DB: binding, SOURCE_LEASE: sourceLease, ENVIRONMENT: "staging" });
    expect(decoded.INGESTION_HYDRATION_PER_RUN).toBe(5);
  });

  it.each([
    ["0", 0],
    ["12", 12],
    ["40", 40],
    [7, 7],
  ] as const)("keeps a valid bounded-hydration override (%j)", (raw, expected) => {
    const decoded = decodeEnv({
      DB: binding,
      SOURCE_LEASE: sourceLease,
      ENVIRONMENT: "staging",
      INGESTION_HYDRATION_PER_RUN: raw,
    });
    expect(decoded.INGESTION_HYDRATION_PER_RUN).toBe(expected);
  });

  it.each(["-1", "41", "2.5", "many"])(
    "fails loud on a malformed bounded-hydration override (%j)",
    (raw) => {
      try {
        decodeEnv({
          DB: binding,
          SOURCE_LEASE: sourceLease,
          ENVIRONMENT: "staging",
          INGESTION_HYDRATION_PER_RUN: raw,
        });
        expect.unreachable("decodeEnv should have thrown");
      } catch (error) {
        expect((error as EnvironmentIncomplete).message).toContain("INGESTION_HYDRATION_PER_RUN");
      }
    },
  );

  it("retains a native Workers AI binding for the model layer", () => {
    const ai = { run: () => Promise.resolve({ response: "[]" }) };
    const decoded = decodeEnv({
      DB: binding,
      SOURCE_LEASE: sourceLease,
      ENVIRONMENT: "staging",
      AI: ai,
    });
    expect(decoded.AI).toBe(ai);
  });
});
