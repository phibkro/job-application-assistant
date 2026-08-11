import { describe, expect, it } from "vitest";
import { TransitionSystem } from "./TransitionSystem.ts";

type State = "ready" | "submitted";
type Event = "confirm";
type Authority = "human" | "system";

describe("TransitionSystem", () => {
  const system = TransitionSystem.make<State, Event, Authority>({
    transition: (state, event, authority) => {
      if (authority !== "human") {
        return TransitionSystem.reject(state, event, authority, "human authority required");
      }
      return state === "ready"
        ? "submitted"
        : TransitionSystem.reject(state, event, authority, "already submitted");
    },
  });

  it("accepts an authorized transition", () => {
    expect(system.apply("ready", "confirm", "human")).toEqual({
      _tag: "Accepted",
      state: "submitted",
    });
  });

  it("returns a typed rejection for unauthorized or invalid transitions", () => {
    const rejected = system.apply("ready", "confirm", "system");
    expect(rejected._tag).toBe("TransitionRejected");
    if (rejected._tag === "TransitionRejected") expect(rejected.reason).toContain("human");
    expect(system.apply("submitted", "confirm", "human")._tag).toBe("TransitionRejected");
  });
});
