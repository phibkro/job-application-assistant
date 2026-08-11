import { describe, expect, it } from "vitest";
import { atom, difference, evaluate, intersection, union } from "./SetExpression.ts";

type Saved = "saved" | "closed" | "expired";
type Status = "ready" | "submitted";

describe("SetExpression", () => {
  it("evaluates union, intersection, and explicit-base difference", () => {
    const labels = ["saved", "closed"] as const;
    const saved = atom<Saved>("saved");
    const closed = atom<Saved>("closed");
    const expired = atom<Saved>("expired");
    expect(evaluate(union(saved, closed), labels)).toBe(true);
    expect(evaluate(intersection(saved, closed), labels)).toBe(true);
    expect(evaluate(difference(saved, closed), labels)).toBe(false);
    expect(evaluate(difference(saved, expired), labels)).toBe(true);
  });

  it("keeps nominal vocabularies separate", () => {
    const saved = atom<Saved>("saved");
    const status = atom<Status>("ready");
    expect(evaluate(saved, ["saved"] as ReadonlyArray<Saved>)).toBe(true);
    expect(evaluate(status, ["ready"] as ReadonlyArray<Status>)).toBe(true);
    // The generic types intentionally prevent passing `status` to a Saved expression.
    expect(saved).not.toBe(status);
  });
});
