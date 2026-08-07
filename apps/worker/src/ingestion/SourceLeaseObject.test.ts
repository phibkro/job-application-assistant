import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import type { SourceLeaseObject } from "./SourceLeaseObject.ts";

/**
 * Exercises the real `SourceLeaseObject` class through a real Durable Object
 * namespace binding (`env.SOURCE_LEASE`, `dev/test.wrangler.jsonc`) — not the
 * hand-built `Map`-backed `ctx.storage` stand-in this file used before.
 *
 * That version's own doc comment named exactly this gap: "What this file
 * *cannot* prove — and does not claim to — is that two concurrent callers
 * against a real Durable Object can never both observe 'free' before either
 * writes... only a real workerd run can show it." A stub that instantiates
 * `SourceLeaseObject` directly proves its own logic is self-consistent; it
 * cannot prove the platform's single-threaded-per-id guarantee, because that
 * guarantee is not this class's code — it is workerd's. Calling through the
 * real namespace binding (`acquire`/`release` as RPC on the stub, exactly as
 * `SourceLeaseObject.ts`'s own production `layer` does) is what closes it.
 *
 * `runInDurableObject`/`runDurableObjectAlarm` come from `cloudflare:test`,
 * the pool's own inspection API — not a second, hand-rolled way to reach
 * inside the object.
 */

// A fresh platform id per test rather than a shared one: the workers pool
// isolates storage per test *file* (see `testSupport/workersSetup.ts`), so a
// Durable Object instance a earlier test acquired is still holding its lease
// when a later test in this file starts, unless each test addresses its own.
let nextPlatform = 0;
const freshStub = () => {
  nextPlatform += 1;
  const id = env.SOURCE_LEASE.idFromName(`platform-${nextPlatform}`);
  return env.SOURCE_LEASE.get(id);
};

describe("SourceLeaseObject, against a real Durable Object", () => {
  it("grants a lease to the first caller and schedules a recovery alarm", async () => {
    const stub = freshStub();
    const before = Date.now();

    const outcome = await stub.acquire("run-1", 60_000);

    expect(outcome).toEqual({ _tag: "Granted" });
    const alarmAt = await runInDurableObject(stub, (_instance: SourceLeaseObject, state) =>
      state.storage.getAlarm(),
    );
    expect(alarmAt).toBeGreaterThanOrEqual(before + 60_000);
  });

  it("denies a second caller while the first still holds it, naming the holder", async () => {
    const stub = freshStub();

    await stub.acquire("run-1", 60_000);
    const outcome = await stub.acquire("run-2", 60_000);

    expect(outcome).toEqual({ _tag: "Held", owner: "run-1" });
  });

  it("releases and cancels the alarm when the caller is who currently holds it", async () => {
    const stub = freshStub();
    await stub.acquire("run-1", 60_000);

    await stub.release("run-1");

    const alarmAt = await runInDurableObject(stub, (_instance: SourceLeaseObject, state) =>
      state.storage.getAlarm(),
    );
    expect(alarmAt).toBeNull();
    // The lease is free again: a fresh caller is granted, not denied.
    expect(await stub.acquire("run-2", 60_000)).toEqual({ _tag: "Granted" });
  });

  it("ignores a release from a caller who does not currently hold the lease", async () => {
    const stub = freshStub();
    await stub.acquire("run-1", 60_000);

    // A run whose lease was already reclaimed (or that never held it) must
    // not be able to clear whoever holds it now.
    await stub.release("someone-else");

    expect(await stub.acquire("run-2", 60_000)).toEqual({ _tag: "Held", owner: "run-1" });
  });

  it("the alarm firing reclaims a lease nobody released — the crash-recovery path", async () => {
    const stub = freshStub();
    await stub.acquire("run-1", 60_000);

    const ran = await runDurableObjectAlarm(stub);

    expect(ran).toBe(true);
    expect(await stub.acquire("run-2", 60_000)).toEqual({ _tag: "Granted" });
  });
});
