import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

const from = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * The half of the suite that runs *inside workerd itself*, against a real D1
 * binding and a real Durable Object namespace (miniflare, driven from
 * `dev/test.wrangler.jsonc`) — not `bun:sqlite`, not a hand-mocked binding.
 *
 * Why this is a second config file rather than a second `test.projects`
 * entry inside `vitest.config.ts`: `@cloudflare/vitest-pool-workers`'s pool
 * runner talks to the spawned workerd process over a `ws` WebSocket
 * connection *from the process that invoked `vitest`*, and Bun's built-in
 * `ws` shim does not implement the `upgrade`/`unexpected-response` events
 * that connection needs — verified directly: `bun run vitest` against this
 * pool hangs for the full startup timeout and never runs a single test,
 * while `node vitest` against the identical config passes in well under a
 * second. A single `vitest` invocation runs in one JS runtime for its whole
 * process lifetime, so one config file cannot ask for "this project under
 * Bun, that project under Node" — only two separate invocations can, which
 * is why `package.json`'s `test:workers`/`coverage:workers` scripts run this
 * file through `nix shell nixpkgs#nodejs -c node …` rather than through Bun.
 *
 * Node is reached for *only that one subprocess* — not added to the shared
 * Nix dev shell — because `flake.nix` already documents why a `node` on the
 * ambient `PATH` breaks Vitest's default pool for the Bun-run project
 * (`bun:sqlite` resolution fails once Node is available to be picked
 * instead). This keeps that fix intact: Node exists only for the literal
 * duration of the workers-project subprocess, nowhere else.
 */
export default defineConfig({
  resolve: {
    // The same three-resolver alias set `vitest.config.ts` declares, for the
    // same reason — Vite resolves none of the workspace's TS path aliases on
    // its own, and the pool bundles both the test files *and* the "main"
    // worker (`dev/test.wrangler.jsonc`'s `main`, `apps/worker/src/index.ts`)
    // through this same Vite pipeline. No `cloudflare:workers` alias here,
    // unlike `vitest.config.ts`: inside workerd that specifier resolves to
    // the real module, which is the entire point of running here.
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
    ],
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./dev/test.wrangler.jsonc" },
    }),
  ],
  test: {
    include: [
      // `db/Sql.test.ts` and `db/Binding.test.ts` stay on the Bun project
      // deliberately: both are pure-function tests (SQL-string building,
      // one binding-value coercion) that never touch D1 — moving them here
      // would only make them slower for no behaviour they'd newly prove.
      // `db/Sqlite.test.ts` and `db/Live.test.ts` stay for the opposite
      // reason: the first tests `bun:sqlite` itself, which does not exist
      // inside workerd any more than it does under plain Node; the second
      // pins `Live.ts`'s call *shape* against `batch()` (that it is called
      // exactly once, with the whole write list) via `FakeD1.ts`'s call
      // counter — a real D1 binding cannot expose how many times it was
      // called, only what the calls did, so the fake is the right tool for
      // that specific claim, not a workaround for one this pool lacks.
      "apps/worker/src/db/repositories/*.test.ts",
      "apps/worker/src/db/Erase.test.ts",
      "apps/worker/src/db/transactionSemantics.live.test.ts",
      "apps/worker/src/ingestion/live.test.ts",
      "apps/worker/src/ingestion/SourceLeaseObject.test.ts",
      "apps/worker/src/corpus/live.test.ts",
      "apps/worker/src/handlers/corpus.live.test.ts",
    ],
    setupFiles: ["./apps/worker/src/testSupport/workersSetup.ts"],
    coverage: {
      provider: "istanbul",
      reportsDirectory: "./coverage/workers",
      // Scoped to exactly what this project's tests exercise for real —
      // `db/**`'s persistence layer, the Durable Object class, and the three
      // `*.live.test.ts` seams. `vitest.config.ts`'s coverage still lists
      // `corpus`/`ingestion`/`handlers` too: those directories have both
      // fake-backed tests (still on Bun) and these live ones, so both
      // reports show a genuine partial slice of the same directory and
      // neither is the combined truth — see the report on why they are not
      // merged.
      include: [
        // Not `db/**`: that also force-includes `Sqlite.ts`/`FakeD1.ts` and
        // their four `.test.ts` files, none of which this project ever
        // loads (they are `bun:sqlite`-only) — every one showed as a false
        // 0%, because `coverage.include` force-instruments a matched file
        // whether or not anything here executes it. Named explicitly here
        // instead: exactly what this project's tests actually reach.
        "apps/worker/src/db/TestLayer.ts",
        "apps/worker/src/db/Live.ts",
        "apps/worker/src/db/Erase.ts",
        "apps/worker/src/db/Sql.ts",
        "apps/worker/src/db/Binding.ts",
        "apps/worker/src/db/repositories/**",
        "apps/worker/src/ingestion/SourceLeaseObject.ts",
        "apps/worker/src/ingestion/index.ts",
        "apps/worker/src/corpus/index.ts",
        "apps/worker/src/handlers/corpus.ts",
      ],
      // `branches` is lower than `vitest.config.ts`'s 70: this project's
      // live tests deliberately exercise one path each (e.g.
      // `handlers/corpus.live.test.ts` proves `listJobs` end to end, not
      // `getJob`'s 404 branch or `listSources` — both are `handlers/
      // corpus.test.ts`'s job, on Bun, against a fake `Corpus`). A narrower
      // project naturally samples fewer branches; 60 is a floor against a
      // regression here, not a target this project's own tests should chase
      // — chasing it would mean re-implementing `corpus.test.ts`'s coverage
      // a second time, slower, for no new claim.
      thresholds: { lines: 80, functions: 80, branches: 60, statements: 80 },
    },
  },
});
