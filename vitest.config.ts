import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    /**
     * Doctests. Effect v4 documents its own API with ```ts import.meta.vitest
     * blocks, and this makes ours executable the same way: an example that
     * stops compiling or stops being true fails the suite instead of quietly
     * misleading the next reader. Documentation that cannot go stale is worth
     * more than documentation that is merely thorough.
     */
    includeSource: ["packages/**/src/**/*.ts", "apps/**/src/**/*.ts"],
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    coverage: {
      /**
       * Istanbul, not v8: the v8 provider drives Node's inspector protocol,
       * which Bun does not implement — it fails with "Coverage APIs are not
       * supported" and collects no tests at all, which reads like a broken
       * suite rather than a missing capability. Istanbul instruments the
       * source instead and works on both runtimes.
       */
      provider: "istanbul",
      /**
       * Only files with behaviour. Service tags, schema declarations, and the
       * API contract are declarations: there is nothing in them to execute, so
       * including them would report a denominator that no test could ever move
       * and hide the modules that genuinely lack tests.
       */
      include: ["packages/domain/src/decide/**", "packages/adapters/**/src/**", "apps/worker/src/{corpus,accounts,drafting,applications,agenda,db}/**"],
      /**
       * A floor, not a target. Coverage says which lines ran, never whether
       * the assertion meant anything — so this exists to catch whole modules
       * nobody tested, not to be maximised.
       */
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
})
