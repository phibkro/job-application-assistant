/**
 * The session token boundary.
 *
 * `sessionStorage` only, never `localStorage`: a token that outlives the
 * browser tab is a token that outlives the person's decision to be signed
 * in. Reading and writing storage is IO, so it stays out of `update` — the
 * runtime touches this only from `flags` (read once at startup) and from
 * Command bodies (write/clear on explicit user action), never from the pure
 * core. That is the seam; `update.ts` is the core it protects.
 */

const STORAGE_KEY = "job-index.session-token";

const storage = (): Storage | undefined =>
  typeof window === "undefined" ? undefined : window.sessionStorage;

export const readToken = (): string | null => storage()?.getItem(STORAGE_KEY) ?? null;

export const writeToken = (token: string): void => {
  storage()?.setItem(STORAGE_KEY, token);
};

export const clearToken = (): void => {
  storage()?.removeItem(STORAGE_KEY);
};
