import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { ModelInference } from "../../services/Inference.ts";
import { layer, type WorkersAi } from "./index.ts";

const run = <A>(effect: Effect.Effect<A, unknown, ModelInference>, ai: WorkersAi | undefined) =>
  Effect.runPromise(Effect.provide(effect, layer(ai)));

describe("ModelInference Workers AI binding", () => {
  it("calls env.AI once and decodes a supported proposal", async () => {
    const calls: Array<{ model: string; input: unknown }> = [];
    const ai: WorkersAi = {
      run: (model, input) => {
        calls.push({ model, input });
        return Promise.resolve({
          response: `\`\`\`json
[{"fieldPath":"skills.0","proposedValue":"TypeScript","evidenceExcerpt":"TypeScript","confidence":"high"},{"fieldPath":"skills.0","proposedValue":"React","evidenceExcerpt":"React","confidence":"high"}]
\`\`\``,
        });
      },
    };
    const drafts = await run(
      Effect.gen(function* () {
        const inference = yield* ModelInference;
        return yield* inference.propose("SKILLS\nTypeScript");
      }),
      ai,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.model).toContain("llama");
    expect(calls[0]?.input).toMatchObject({ temperature: 0 });
    expect(drafts).toEqual([
      {
        fieldPath: "skills.0",
        proposedValue: "TypeScript",
        evidenceExcerpt: "TypeScript",
        confidence: "high",
      },
      {
        fieldPath: "skills.1",
        proposedValue: "React",
        evidenceExcerpt: "React",
        confidence: "high",
      },
    ]);
  });

  it("keeps valid siblings when one proposal fails its target schema", async () => {
    const ai: WorkersAi = {
      run: () =>
        Promise.resolve({
          response: JSON.stringify([
            {
              fieldPath: "summary",
              proposedValue: { invalid: true },
              evidenceExcerpt: "not a summary",
              confidence: "high",
            },
            {
              fieldPath: "location",
              proposedValue: "Bergen",
              evidenceExcerpt: "Based in Bergen",
              confidence: "high",
            },
          ]),
        }),
    };

    const drafts = await run(
      Effect.gen(function* () {
        const inference = yield* ModelInference;
        return yield* inference.propose("Based in Bergen");
      }),
      ai,
    );

    expect(drafts).toEqual([
      {
        fieldPath: "location",
        proposedValue: "Bergen",
        evidenceExcerpt: "Based in Bergen",
        confidence: "high",
      },
    ]);
  });

  it("maps malformed model output to the explicit fallback error", async () => {
    const ai: WorkersAi = { run: () => Promise.resolve({ response: "not json" }) };
    await expect(
      run(
        Effect.gen(function* () {
          const inference = yield* ModelInference;
          return yield* inference.propose("CV");
        }),
        ai,
      ),
    ).rejects.toMatchObject({
      _tag: "ModelUnavailable",
      reason: expect.stringContaining("invalid"),
    });
  });

  it("reports an absent binding without making a request", async () => {
    await expect(
      run(
        Effect.gen(function* () {
          const inference = yield* ModelInference;
          return yield* inference.propose("CV");
        }),
        undefined,
      ),
    ).rejects.toMatchObject({
      _tag: "ModelUnavailable",
      reason: expect.stringContaining("not provisioned"),
    });
  });
});
