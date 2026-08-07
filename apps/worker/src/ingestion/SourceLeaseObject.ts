import { DurableObject } from "cloudflare:workers";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { PlatformId } from "@job-index/domain/Ids";
import { SourceLease } from "../services/SourceLease.ts";
import type { LeaseOutcome } from "../services/SourceLease.ts";

/**
 * One Durable Object instance per source (`namespace.idFromName(platformId)`
 * — see `layer` below), so "one collector for this source" is a property of
 * *where this code runs*: a Durable Object is single-threaded and globally
 * unique per id, so two concurrent `acquire` calls for the same platform can
 * never both observe "free" — there is no window between a check and a
 * write for a second caller to land in, the way there was for two `INSERT`s
 * racing a `WHERE` clause against a table with no locks.
 *
 * This object knows only "is a run active, and who owns it". The cursor and
 * the accumulated `seenExternalIds` are not here — they stay in
 * `source_state` (D1), because they are the corpus's business, not this
 * object's; see `packages/domain/src/Ingestion.ts`'s doc comment.
 */

const ACTIVE_KEY = "active";

interface ActiveRun {
  readonly owner: string;
}

export class SourceLeaseObject extends DurableObject {
  /**
   * Grants the lease iff nobody currently holds it. Checked and set as one
   * `await`-free stretch of this object's single thread, so no other call
   * to this same instance can interleave between the read and the write.
   *
   * Schedules this object's one alarm slot at `now + recoverAfterMs`. If
   * `release` is never called — the caller's worker was killed, not merely
   * slow; `Ingestion.collect` always releases via `Effect.ensuring` — the
   * alarm is what reclaims the lease. One deadline, set once when the lease
   * is granted, fired at most once, compared against nothing by anyone
   * outside this object.
   */
  async acquire(owner: string, recoverAfterMs: number): Promise<LeaseOutcome> {
    const active = await this.ctx.storage.get<ActiveRun>(ACTIVE_KEY);
    if (active !== undefined) {
      return { _tag: "Held", owner: active.owner };
    }
    await this.ctx.storage.put<ActiveRun>(ACTIVE_KEY, { owner });
    await this.ctx.storage.setAlarm(Date.now() + recoverAfterMs);
    return { _tag: "Granted" };
  }

  /**
   * Releases iff `owner` is who currently holds the lease — a run whose
   * lease the alarm already reclaimed (or that never held it) must not
   * clear whoever holds it now. Cancels the pending alarm: an on-time
   * release that left the old alarm armed would fire into whatever run
   * holds the lease next and clear its grant early.
   */
  async release(owner: string): Promise<void> {
    const active = await this.ctx.storage.get<ActiveRun>(ACTIVE_KEY);
    if (active === undefined || active.owner !== owner) {
      return;
    }
    await this.ctx.storage.delete(ACTIVE_KEY);
    await this.ctx.storage.deleteAlarm();
  }

  /**
   * The recovery path: nothing released this lease before its deadline, so
   * whoever holds it is presumed gone and the source is freed. Cloudflare
   * fires this at most once per `setAlarm` call, and only if the alarm was
   * never cancelled — which `release` above always does on the normal path.
   */
  async alarm(): Promise<void> {
    await this.ctx.storage.delete(ACTIVE_KEY);
  }
}

/**
 * The slice of the real `DurableObjectNamespace` binding this module
 * depends on, typed structurally rather than imported from
 * `@cloudflare/workers-types` — not installed anywhere in this workspace,
 * the same call `db/D1.ts` makes for the D1 binding. A real namespace
 * binding satisfies this shape structurally, so nothing is lost at the call
 * site.
 */
export interface SourceLeaseStub {
  acquire(owner: string, recoverAfterMs: number): Promise<LeaseOutcome>;
  release(owner: string): Promise<void>;
}

export interface SourceLeaseNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): SourceLeaseStub;
}

/**
 * `SourceLease`, wired to one Durable Object namespace binding — a factory
 * rather than a bare `Layer`, the same reason `db/Live.ts`'s `layer` is one:
 * the binding only exists per-request, not at module scope.
 *
 * `idFromName(platform)` is what makes "one object per source" true: the
 * same platform id always resolves to the same Durable Object instance, so
 * every `collect` call for a given platform — from any isolate, any
 * request — reaches the one object that can answer "is someone already
 * running".
 */
export const layer = (namespace: SourceLeaseNamespace): Layer.Layer<SourceLease> =>
  Layer.succeed(SourceLease, {
    acquire: (platform: PlatformId, owner, recoverAfterMs) =>
      Effect.tryPromise(() =>
        namespace.get(namespace.idFromName(platform)).acquire(owner, recoverAfterMs),
      ).pipe(Effect.orDie),
    release: (platform: PlatformId, owner) =>
      Effect.tryPromise(() => namespace.get(namespace.idFromName(platform)).release(owner)).pipe(
        Effect.asVoid,
        Effect.orDie,
      ),
  });
