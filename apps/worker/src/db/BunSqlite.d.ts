/**
 * Minimal ambient types for `bun:sqlite`, scoped to exactly what `Sqlite.ts`
 * uses.
 *
 * `bun-types` (the full official package) is not installed anywhere in this
 * workspace — adding it would mean editing a `package.json`, which sits
 * outside this slot's ownership (`apps/worker/src/db/**` only). This file is
 * the structural minimum that lets `tsc` see the module without that
 * dependency; it is not a general-purpose replacement for `bun-types`.
 */
declare module "bun:sqlite" {
  export interface Statement<T = unknown> {
    all(...bindings: ReadonlyArray<unknown>): Array<T>;
    run(...bindings: ReadonlyArray<unknown>): unknown;
    get(...bindings: ReadonlyArray<unknown>): T | null;
  }

  export class Database {
    constructor(filename?: string);
    exec(sql: string): void;
    query<T = unknown>(sql: string): Statement<T>;
    close(): void;
  }
}
