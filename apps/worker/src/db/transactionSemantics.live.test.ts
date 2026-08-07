import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";

/**
 * The falsifier this migration exists to make possible: a test that passes
 * against the real binding and would fail against `bun:sqlite` — proving
 * this file's Worker is genuinely inside workerd, not a `bun:sqlite` engine
 * wearing a D1-shaped interface.
 *
 * `Database.atomic`'s own doc comment (`services/Database.ts`) states the
 * claim in prose: "the Workers Binding API offers no `BEGIN` for application
 * code". This is that claim, executed. `db/Sqlite.test.ts`'s "an interactive
 * transaction, the trap this contract's shape used to invite" test asserts
 * the other half, against `layerSqlite()`: the identical statement succeeds
 * there and opens a transaction bun:sqlite is happy to leave dangling. Same
 * SQL, opposite outcome, by construction of which engine is underneath — not
 * by anything either test asserts about itself.
 */
describe("D1's transaction primitive, against the real local binding", () => {
  it("rejects an application-level BEGIN outright — bun:sqlite silently accepts the identical statement", async () => {
    await expect(env.DB.prepare("BEGIN").run()).rejects.toThrow();
  });
});
