/**
 * Test-only stand-in for the real `cloudflare:workers` module, which
 * resolves only inside workerd — never under Bun/Vitest. Aliased in
 * `vitest.config.ts` so a file that imports the real module (per
 * Cloudflare's own documented shape for a Durable Object class, e.g.
 * `ingestion/SourceLeaseObject.ts`) can still be loaded and unit-tested
 * directly, against a fake `ctx`/`env` rather than a real binding.
 *
 * Not a general-purpose polyfill — just enough of `DurableObject`'s
 * constructor contract for a subclass to instantiate the same way workerd
 * instantiates it, `new SourceLeaseObject(ctx, env)`.
 */
export class DurableObject<Env = unknown> {
  constructor(
    readonly ctx: unknown,
    readonly env: Env,
  ) {}
}
