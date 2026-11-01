import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";

/**
 * WS-0022 step 1 (lead amendment L3): does D1, inside workerd, accept `CREATE TRIGGER`, and does a
 * `RAISE(ABORT, ...)` trigger actually reject `UPDATE`/`DELETE`? Append-only enforcement is a precondition of
 * this slice; if this fails, the slice stops.
 */
describe("D1 trigger probe (WS-0022 L3)", () => {
  it("accepts CREATE TRIGGER and a RAISE(ABORT) trigger rejects UPDATE and DELETE", async () => {
    await env.DB.prepare("CREATE TABLE probe (id TEXT PRIMARY KEY, v TEXT NOT NULL)").run();
    await env.DB.prepare(
      "CREATE TRIGGER probe_no_update BEFORE UPDATE ON probe BEGIN SELECT RAISE(ABORT, 'probe is append-only'); END",
    ).run();
    await env.DB.prepare(
      "CREATE TRIGGER probe_no_delete BEFORE DELETE ON probe BEGIN SELECT RAISE(ABORT, 'probe is append-only'); END",
    ).run();
    await env.DB.prepare("INSERT INTO probe (id, v) VALUES ('a', 'x')").run();
    const triggers = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'probe' ORDER BY name",
    ).all<{ name: string }>();
    expect(triggers.results.map((row) => row.name)).toEqual(["probe_no_delete", "probe_no_update"]);
    await expect(env.DB.prepare("UPDATE probe SET v = 'y' WHERE id = 'a'").run()).rejects.toThrow(
      /append-only/,
    );
    await expect(env.DB.prepare("DELETE FROM probe WHERE id = 'a'").run()).rejects.toThrow(
      /append-only/,
    );
    // In a batch (D1's transaction unit), the trigger aborts the whole batch.
    await expect(
      env.DB.batch([
        env.DB.prepare("INSERT INTO probe (id, v) VALUES ('b', 'x')"),
        env.DB.prepare("UPDATE probe SET v = 'z' WHERE id = 'a'"),
      ]),
    ).rejects.toThrow(/append-only/);
    const rows = await env.DB.prepare("SELECT id, v FROM probe ORDER BY id").all<{
      id: string;
      v: string;
    }>();
    expect(rows.results).toEqual([{ id: "a", v: "x" }]);
  });
});
