import { fileURLToPath } from "node:url"
import { defaultExclude, defineConfig } from "vitest/config"

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
      // `cloudflare:workers` resolves only inside workerd. `SourceLeaseObject.ts`
      // itself is now only *tested* for real, inside workerd
      // (`vitest.workers.config.ts`, `ingestion/SourceLeaseObject.test.ts`) —
      // but it is still *imported*, transitively, by `runtime/Layers.test.ts`
      // (via `runtime/Layers.ts` and the Worker entry point `index.ts`),
      // which stays on Bun deliberately: it wires the whole service graph
      // against `FakeD1.ts` (a real SQL engine, `bun:sqlite`-backed, faking
      // only the D1 *binding shape*), not a real binding — see that file's
      // own header for why `bun:sqlite` is the right engine for what it
      // proves. This alias is what lets that import still resolve there.
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
    // The workers-pool half of the suite (`vitest.workers.config.ts`): real
    // D1/Durable-Object-backed tests that only make sense — and only
    // resolve, once `TestLayer.ts` reaches for a real `env.DB` — inside
    // workerd. Excluded here rather than left to fail under Bun.
    exclude: [
      ...defaultExclude,
      "apps/worker/src/db/repositories/*.test.ts",
      "apps/worker/src/db/Erase.test.ts",
      "apps/worker/src/db/transactionSemantics.live.test.ts",
      "apps/worker/src/ingestion/live.test.ts",
      "apps/worker/src/ingestion/SourceLeaseObject.test.ts",
      "apps/worker/src/corpus/live.test.ts",
      "apps/worker/src/handlers/corpus.live.test.ts",
    ],
    coverage: {
      /**
       * Istanbul, not v8: the v8 provider drives Node's inspector protocol,
       * which Bun does not implement — it fails with "Coverage APIs are not
       * supported" and collects no tests at all, which reads like a broken
       * suite rather than a missing capability. Istanbul instruments the
       * source instead and works on both runtimes.
       */
      provider: "istanbul",
      // Its own directory: `vitest.workers.config.ts` runs as a wholly
      // separate `vitest` process (see that file for why) and writes its own
      // coverage report — same default `./coverage` would let whichever one
      // finishes last silently overwrite the other's.
      reportsDirectory: "./coverage/unit",
      /**
       * Only files with behaviour. Service tags, schema declarations, and the
       * API contract are declarations: there is nothing in them to execute, so
       * including them would report a denominator that no test could ever move
       * and hide the modules that genuinely lack tests.
       */
      include: [
        "packages/domain/src/decide/**",
        "packages/adapters/**/src/**",
        "apps/worker/src/{corpus,accounts,drafting,applications,agenda,handlers,runtime,ingestion}/**",
        // Not `db/**`: `db/repositories/**` and `db/Erase.ts` moved to the
        // workers project wholesale (`vitest.workers.config.ts` covers
        // them), and `db/TestLayer.ts` now only resolves inside workerd
        // (it imports `cloudflare:workers`). This list is exactly the
        // `db/` files a Bun-run test still exercises — `Sql.test.ts` and
        // `Binding.test.ts` on pure functions, `Sqlite.test.ts` on
        // `bun:sqlite` itself, `Live.test.ts` on `Live.ts`'s call shape.
        "apps/worker/src/db/{D1,Sql,Binding,Sqlite,Live,FakeD1,index}.ts",
      ],
      /**
       * A floor, not a target. Coverage says which lines ran, never whether
       * the assertion meant anything — so this exists to catch whole modules
       * nobody tested, not to be maximised.
       */
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
})
