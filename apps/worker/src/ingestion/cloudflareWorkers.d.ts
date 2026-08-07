/**
 * Minimal ambient types for `cloudflare:workers`, scoped to exactly what
 * `SourceLeaseObject.ts` uses.
 *
 * `@cloudflare/workers-types` (the full official package) is not installed
 * anywhere in this workspace — adding it would mean editing a
 * `package.json`, outside this slot's ownership. This file is the
 * structural minimum that lets `tsc` see the module without that
 * dependency, the same move `db/BunSqlite.d.ts` makes for `bun:sqlite`.
 *
 * At runtime this module resolves only inside workerd. `bun build`'s
 * `--external "cloudflare:*"` leaves the import alone for a real deploy;
 * `vitest.config.ts` aliases it to a fake for unit tests. Neither reads this
 * file — it exists for `tsc` alone.
 */
declare module "cloudflare:workers" {
  export interface DurableObjectStorage {
    get<T = unknown>(key: string): Promise<T | undefined>;
    put<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<boolean>;
    setAlarm(scheduledTime: number | Date): Promise<void>;
    deleteAlarm(): Promise<void>;
  }

  export interface DurableObjectState {
    readonly storage: DurableObjectStorage;
  }

  export class DurableObject<Env = unknown> {
    constructor(ctx: DurableObjectState, env: Env);
    readonly ctx: DurableObjectState;
    readonly env: Env;
  }
}
