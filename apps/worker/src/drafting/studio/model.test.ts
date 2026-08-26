import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { ModelStudioComposer } from "../../services/Studio.ts";
import {
  layer,
  makeModelUnavailable,
  makeProposingModel,
  MAX_MODEL_INPUT_CHARS,
  promptFor,
} from "./model.ts";

/**
 * WS-0018: the model engine's binding contract. `env.AI` is unprovisioned
 * this slice, so these tests use a fake `WorkersAi` handle and the exported
 * fakes — no real model endpoint is ever contacted.
 *
 * WS-0019: the model receives the keyed inventory and its output is
 * finalized (leak-scanned, substituted, structurally checked) inside the
 * layer. A fake that returns raw values or invented tokens degrades exactly
 * like an unavailable binding would.
 */

const profile = {
  headline: "Baker",
  summary: "I bake.",
  location: "Oslo",
  languages: "",
  skills: ["Sourdough"],
  experience: [],
  education: [],
};

const runWith = <A>(effect: Effect.Effect<A, unknown, ModelStudioComposer>, ai?: unknown) =>
  Effect.runPromise(Effect.provide(effect, layer(ai as never)));

const compose = Effect.flatMap(ModelStudioComposer, (s) =>
  s.compose(profile, [], "letter", undefined),
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
  it("calls the named model with temperature 0 and a prompt carrying no raw values", async () => {
    const calls: Array<{ model: string; input: { prompt?: string; temperature?: number } }> = [];
    const ai = {
      run: (model: string, input: unknown) => {
        calls.push({ model, input: input as { prompt?: string; temperature?: number } });
        return Promise.resolve({
          response: "Dear hiring team, I am {{profile.headline}} with {{profile.skills.0}}.",
        });
      },
    };
    const composed = await runWith(compose, ai);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.model).toContain("llama");
    expect(calls[0]?.input.temperature).toBe(0);
    // The prompt carries keys, never values:
    expect(calls[0]?.input.prompt).toContain("{{profile.headline}}");
    expect(calls[0]?.input.prompt?.includes("Baker")).toBe(false);
    expect(calls[0]?.input.prompt?.includes("Sourdough")).toBe(false);
    // And the reply's placeholders were substituted locally:
    expect(composed.engine).toBe("model");
    expect(composed.content).toContain("Baker");
    expect(composed.content).toContain("Sourdough");
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

describe("model studio composer — placeholder-leak matrix (WS-0019 c)", () => {
  it("degrades when the model echoes a raw value instead of a token", async () => {
    const ai = { run: () => Promise.resolve({ response: "A letter from Baker himself." }) };
    const result = await Effect.runPromiseExit(Effect.provide(compose, layer(ai as never)));
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(String(result.cause)).toContain("echoed raw values");
    }
  });

  it("degrades when the model invents tokens outside the fact inventory", async () => {
    const ai = {
      run: () => Promise.resolve({ response: "Use {{profile.skills.99}} and {{who.knows}}." }),
    };
    const result = await Effect.runPromiseExit(Effect.provide(compose, layer(ai as never)));
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(String(result.cause)).toContain("outside the fact inventory");
    }
  });

  it("substitutes proper keyed output and stores it with engine=model", async () => {
    const ai = {
      run: () =>
        Promise.resolve({
          response:
            "I am {{profile.headline}}, skilled in {{profile.skills.0}}, based in {{profile.location}}.",
        }),
    };
    const composed = await runWith(compose, ai);
    expect(composed).toEqual({
      kind: "letter",
      content: "I am Baker, skilled in Sourdough, based in Oslo.",
      engine: "model",
    });
  });

  it("a short-value false-positive exemption keeps honest prose flowing", async () => {
    // "Oslo" is 4 chars and scanned; the word appears only via token here anyway.
    const ai = { run: () => Promise.resolve({ response: "Based in {{profile.location}}." }) };
    const composed = await runWith(compose, ai);
    expect(composed.content).toBe("Based in Oslo.");
  });
});

describe("model studio composer — token-boundary input bound", () => {
  const hugeProfile = {
    ...profile,
    skills: Array.from({ length: 8_000 }, (_, index) => `secret-😀-${index}`),
  };

  it("admits only whole token lines, preserves the closing instruction, and sends no values", () => {
    const grounding = promptFor(hugeProfile, [], "cv", undefined);
    expect(grounding).toBeDefined();
    if (grounding === undefined) return;
    expect(grounding.prompt.length).toBeLessThanOrEqual(MAX_MODEL_INPUT_CHARS);
    expect(grounding.prompt.endsWith("Return only the document text.")).toBe(true);
    expect(grounding.prompt).not.toContain("secret-");
    expect(grounding.prompt).not.toContain("😀");
    expect(grounding.prompt.match(/\{\{/g)?.length).toBe(grounding.prompt.match(/\}\}/g)?.length);
    expect(grounding.prompt).toContain("{{profile.skills.1000}}");

    const sentKeys = new Set(grounding.facts.map((fact) => fact.key));
    const omitted = `profile.skills.${hugeProfile.skills.findIndex(
      (_value, index) => !sentKeys.has(`profile.skills.${index}`),
    )}`;
    expect(grounding.prompt).not.toContain(`{{${omitted}}}`);
    expect(grounding.prompt.length + 1 + `{{${omitted}}}`.length).toBeGreaterThan(
      MAX_MODEL_INPUT_CHARS,
    );
    expect(grounding.finalize(`Guessed {{${omitted}}}.`)._tag).toBe("UnresolvedPlaceholder");
  });

  it("a model that guesses an omitted token degrades instead of substituting its local value", async () => {
    const grounding = promptFor(hugeProfile, [], "cv", undefined);
    expect(grounding).toBeDefined();
    if (grounding === undefined) return;
    const sentKeys = new Set(grounding.facts.map((fact) => fact.key));
    const omittedIndex = hugeProfile.skills.findIndex(
      (_value, index) => !sentKeys.has(`profile.skills.${index}`),
    );
    expect(omittedIndex).toBeGreaterThan(0);
    const ai = {
      run: () => Promise.resolve({ response: `Use {{profile.skills.${omittedIndex}}}.` }),
    };
    await expect(
      runWith(
        Effect.flatMap(ModelStudioComposer, (service) =>
          service.compose(hugeProfile, [], "cv", undefined),
        ),
        ai,
      ),
    ).rejects.toMatchObject({ _tag: "StudioModelUnavailable" });
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
