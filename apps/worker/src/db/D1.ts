/**
 * The slice of Cloudflare's real `D1Database` binding this module depends
 * on, typed structurally rather than imported from `@cloudflare/workers-types`
 * — that package is not installed anywhere in this workspace, and adding it
 * would mean editing a `package.json`, outside this slot's ownership
 * (`apps/worker/src/db/**` only). A real `D1Database` satisfies this shape
 * structurally, so nothing is lost at the call site.
 */
export interface D1PreparedStatement {
  bind(...values: ReadonlyArray<unknown>): D1PreparedStatement;
  all<T = unknown>(): Promise<{ readonly results: ReadonlyArray<T> }>;
  run(): Promise<D1Result>;
}

export interface D1Result<T = unknown> {
  readonly results: ReadonlyArray<T>;
  readonly meta: {
    readonly changes: number;
  };
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  /**
   * D1's one atomicity primitive: a list of already-bound prepared
   * statements executed as a single SQL transaction, committed or rolled
   * back together. See `Live.ts` for why `Database.transaction` is built on
   * this rather than on `BEGIN`/`COMMIT`.
   */
  batch(statements: ReadonlyArray<D1PreparedStatement>): Promise<ReadonlyArray<D1Result>>;
}
