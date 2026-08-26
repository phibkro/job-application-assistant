import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { ModelStudioComposer } from "../../services/Studio.ts";
import { layer, makeModelUnavailable, makeProposingModel } from "./model.ts";

/**
 * WS-0018: the model engine's binding contract. `env.AI` is unprovisioned
 * this slice, so these tests use a fake `WorkersAi` handle and the exported
 * fakes — no real model endpoint is ever contacted.
 */

const runWith = <A>(effect: Effect.Effect<A, unknown, ModelStudioComposer>, ai?: unknown) =>
  Effect.runPromise(Effect.provide(effect, layer(ai as never)));

const compose = Effect.flatMap(ModelStudioComposer, (s) =>
  s.compose(
    {
      headline: "Baker",
      summary: "",
      location: "",
      languages: "",
      skills: ["Sourdough"],
      experience: [],
      education: [],
    },
    [],
    "letter",
    undefined,
  ),
);

describe("model studio composer — binding (WS-0018)", () => {
  it("fails with StudioModelUnavailable and never requests when env.AI is absent", async () => {
    const result = await Effect.runPromiseExit(Effect.provide(compose, layer(undefined)));
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(String(result.cause)).toContain("StudioModelUnavailable");
      expect(String(result.cause)).toContain("not provisioned");
    }
  });
  it("calls the named model with temperature 0 and returns its text", async () => {
    const calls: Array<{ model: string; input: unknown }> = [];
    const ai = {
      run: (model: string, input: unknown) => {
        calls.push({ model, input });
        return Promise.resolve({ response: "A drafted letter." });
      },
    };
    const composed = await runWith(compose, ai);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.model).toContain("llama");
    expect(calls[0]?.input).toMatchObject({ temperature: 0 });
    expect(composed).toEqual({ kind: "letter", content: "A drafted letter.", engine: "model" });
  });

  it("maps a failed request to StudioModelUnavailable", async () => {
    const ai = { run: () => Promise.reject(new Error("boom")) };
    await expect(runWith(compose, ai)).rejects.toMatchObject({
      _tag: "StudioModelUnavailable",
    });
  });

  it("maps an unusable response shape to StudioModelUnavailable", async () => {
    await expect(
      runWith(compose, { run: () => Promise.resolve({ unexpected: true }) }),
    ).rejects.toMatchObject({ _tag: "StudioModelUnavailable" });
  });

  it("degrades when the response exceeds the document bound", async () => {
    const ai = { run: () => Promise.resolve({ response: "x".repeat(200_001) }) };
    await expect(runWith(compose, ai)).rejects.toMatchObject({
      _tag: "StudioModelUnavailable",
    });
  });

  it("accepts a response exactly at the document bound", async () => {
    const ai = { run: () => Promise.resolve({ response: "y".repeat(200_000) }) };
    const composed = await runWith(compose, ai);
    expect(composed.engine).toBe("model");
    expect(composed.content).toHaveLength(200_000);
  });
});

describe("model studio test doubles (WS-0018)", () => {
  it("the unavailable fake drives the degrade path", async () => {
    const result = await Effect.runPromiseExit(
      Effect.provide(compose, makeModelUnavailable("binding missing")),
    );
    expect(result._tag).toBe("Failure");
  });

  it("the proposing fake drives the entitled happy path", async () => {
    const composed = await Effect.runPromise(
      Effect.provide(compose, makeProposingModel("Premium prose.")),
    );
    expect(composed.engine).toBe("model");
    expect(composed.content).toBe("Premium prose.");
  });
});
