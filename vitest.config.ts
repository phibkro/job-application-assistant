import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const from = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  /**
   * Three resolvers must agree. TypeScript reads tsconfig `paths`, Bun reads
   * them too, and Vite reads neither — so a cross-package import type-checks,
   * runs under Bun, and fails only in the tests. Worse, an import from inside
   * a package resolves by Node self-reference and passes, which makes the
   * defect look fixed when it is not.
   *
   * Declaring the alias here is what makes the three agree.
   */
  resolve: {
    alias: [
      { find: /^@job-index\/domain\/(.*)$/, replacement: from("./packages/domain/src/$1.ts") },
      { find: /^@job-index\/worker\/(.*)$/, replacement: from("./apps/worker/src/$1.ts") },
      { find: "@job-index/adapters/nav", replacement: from("./packages/adapters/nav/src/index.ts") },
      { find: "@job-index/adapters/jsonld", replacement: from("./packages/adapters/jsonld/src/index.ts") },
      {
        find: /^@job-index\/adapters\/shared\/(.*)$/,
        replacement: from("./packages/adapters/shared/src/$1.ts"),
      },
      { find: /^@job-index\/adapters\/(.*)$/, replacement: from("./packages/adapters/src/$1.ts") },
      // `cloudflare:workers` resolves only inside workerd. This is what lets
      // a Durable Object class (`ingestion/SourceLeaseObject.ts`) load under
      // Vitest at all, against the fake `DurableObject` base in
      // `testSupport/cloudflareWorkers.ts` rather than the real module.
      {
        find: "cloudflare:workers",
        replacement: from("./apps/worker/src/testSupport/cloudflareWorkers.ts"),
      },
    ],
  },
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
      include: ["packages/domain/src/decide/**", "packages/adapters/**/src/**", "apps/worker/src/{corpus,accounts,drafting,applications,agenda,db,handlers,runtime,ingestion}/**"],
      /**
       * A floor, not a target. Coverage says which lines ran, never whether
       * the assertion meant anything — so this exists to catch whole modules
       * nobody tested, not to be maximised.
       */
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
})
