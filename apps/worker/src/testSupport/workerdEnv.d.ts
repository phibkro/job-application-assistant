import type { Env as WorkerEnv } from "../runtime/Env.ts";

/**
 * Ambient types the workers-pool test project needs beyond what
 * `ingestion/cloudflareWorkers.d.ts` already declares (that file is scoped
 * deliberately narrowly to what `SourceLeaseObject.ts` itself uses; ambient
 * `declare module "cloudflare:workers"` blocks merge across files, so this
 * one only adds what it needs on top).
 *
 * `@cloudflare/workers-types` is not installed here, for the same reason
 * `db/D1.ts` gives for hand-writing `D1Database`: this workspace's own
 * structural types already say everything a test needs. `Cloudflare.Env` is
 * the platform's own name for the ambient `env` global's shape — declared
 * here as an alias of `runtime/Env.ts`'s `Env`, the one place that shape is
 * authored, so a binding added there is what a test sees too.
 */
declare global {
  namespace Cloudflare {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- pure alias onto the one authored `Env`
    interface Env extends WorkerEnv {}
  }
}

declare module "cloudflare:workers" {
  export const env: Cloudflare.Env;

  interface DurableObjectStorage {
    /** Only `SourceLeaseObject.test.ts` reads this back, to assert the
     *  recovery alarm was actually scheduled/cleared against the real
     *  Durable Object — `SourceLeaseObject.ts` itself never calls it. */
    getAlarm(): Promise<number | null>;
  }
}

/**
 * `db/schema.sql` imported as its raw text (Vite's `?raw` suffix) rather than
 * read from disk: a workers-pool test runs *inside* workerd, which has no
 * filesystem, so `node:fs.readFileSync` — what `Sqlite.ts`/`FakeD1.ts` use on
 * Bun/Node — is not available to it. The bundler inlines the file's content
 * at build time instead, which is available anywhere the bundle runs.
 */
declare module "*.sql?raw" {
  const content: string;
  export default content;
}
