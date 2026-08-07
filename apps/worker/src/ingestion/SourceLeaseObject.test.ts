import { describe, expect, it } from "vitest";
import { SourceLeaseObject } from "./SourceLeaseObject.ts";

/**
 * A minimal in-memory stand-in for the real `DurableObjectState.storage`,
 * exercising `SourceLeaseObject`'s own logic directly rather than through
 * the Effect-wrapped `SourceLease` service — the object's constructor
 * contract (`new SourceLeaseObject(ctx, env)`) is exactly what workerd calls
 * it with, so this is the same shape a real instantiation sees, just backed
 * by a `Map` instead of the platform's durable storage.
 *
 * What this file *cannot* prove — and does not claim to — is that two
 * concurrent callers against a real Durable Object can never both observe
 * "free" before either writes. That guarantee comes from the platform
 * (single-threaded, one instance per id), not from this object's source
 * code, and only a real workerd run can show it: see the operator report
 * for the `just preview` run this slot verified against.
 */
const fakeState = () => {
  const values = new Map<string, unknown>();
  let alarm: number | undefined;
  return {
    ctx: {
      storage: {
        get: async <T>(key: string) => values.get(key) as T | undefined,
        put: async <T>(key: string, value: T) => {
          values.set(key, value);
        },
        delete: async (key: string) => values.delete(key),
        setAlarm: async (scheduledTime: number | Date) => {
          alarm = typeof scheduledTime === "number" ? scheduledTime : scheduledTime.getTime();
        },
        deleteAlarm: async () => {
          alarm = undefined;
        },
      },
    },
    alarmAt: () => alarm,
  };
};

const object = (state: ReturnType<typeof fakeState>) =>
  new SourceLeaseObject(state.ctx as never, {});

describe("SourceLeaseObject", () => {
  it("grants a lease to the first caller and schedules a recovery alarm", async () => {
    const state = fakeState();
    const before = Date.now();

    const outcome = await object(state).acquire("run-1", 60_000);

    expect(outcome).toEqual({ _tag: "Granted" });
    expect(state.alarmAt()).toBeGreaterThanOrEqual(before + 60_000);
  });

  it("denies a second caller while the first still holds it, naming the holder", async () => {
    const state = fakeState();
    const lease = object(state);

    await lease.acquire("run-1", 60_000);
    const outcome = await lease.acquire("run-2", 60_000);

    expect(outcome).toEqual({ _tag: "Held", owner: "run-1" });
  });

  it("releases and cancels the alarm when the caller is who currently holds it", async () => {
    const state = fakeState();
    const lease = object(state);
    await lease.acquire("run-1", 60_000);

    await lease.release("run-1");

    expect(state.alarmAt()).toBeUndefined();
    // The lease is free again: a fresh caller is granted, not denied.
    expect(await lease.acquire("run-2", 60_000)).toEqual({ _tag: "Granted" });
  });

  it("ignores a release from a caller who does not currently hold the lease", async () => {
    const state = fakeState();
    const lease = object(state);
    await lease.acquire("run-1", 60_000);

    // A run whose lease was already reclaimed (or that never held it) must
    // not be able to clear whoever holds it now.
    await lease.release("someone-else");

    expect(await lease.acquire("run-2", 60_000)).toEqual({ _tag: "Held", owner: "run-1" });
  });

  it("the alarm firing reclaims a lease nobody released — the crash-recovery path", async () => {
    const state = fakeState();
    const lease = object(state);
    await lease.acquire("run-1", 60_000);

    await lease.alarm();

    expect(await lease.acquire("run-2", 60_000)).toEqual({ _tag: "Granted" });
  });
});
