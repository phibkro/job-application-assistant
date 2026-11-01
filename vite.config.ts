import { defineConfig } from "vite-plus";

/**
 * Vite+ (WS-0027@2): one entry point for static checks and repository tasks. `vp check` is format + lint over
 * today's scope; `vp run <task>` replaces the justfile, scripts/dispatch.sh, scripts/check.sh and the
 * package.json script chain. Task semantics: node_modules/vite-plus/docs/config/run.md and guide/run.md.
 *
 * Tests stay on Vitest 4 (owner decision, WS-0027@2). Vite+ 1.x bundles Vitest 5, which neither
 * @cloudflare/vitest-pool-workers (<= 0.23.0, peer ^4.1) nor @better-auth/test-utils@1.6.26 supports, so the
 * `test`/`coverage` tasks start the installed Vitest 4 directly: the unit suite under Bun (`bun:sqlite`), the
 * workerd suite under Node (vitest.workers.config.ts says why). `vp test` is deliberately not used.
 */
const bunSuite = "bun node_modules/vitest/vitest.mjs run";
const workerdSuite = "node node_modules/vitest/vitest.mjs run -c vitest.workers.config.ts";
const bundle =
  'bun build apps/worker/src/index.ts --target=browser --conditions=workerd --conditions=worker --external "cloudflare:*"';

export default defineConfig({
  fmt: {
    // Today's scope: `oxfmt --check packages apps`. Everything at the root except those two is ignored.
    ignorePatterns: ["/*", "!/packages/", "!/apps/"],
  },
  lint: {
    categories: {
      correctness: "error",
      suspicious: "error",
      perf: "warn",
    },
    rules: {
      "no-console": "error",
      eqeqeq: "error",
      "typescript/no-explicit-any": "error",
      "typescript/consistent-type-imports": "error",
      "no-underscore-dangle": ["error", { allow: ["_tag"] }],
    },
    ignorePatterns: ["node_modules", "infra/node_modules", "target", ".wrangler", ".artifacts", "crates"],
    overrides: [
      {
        files: ["packages/domain/**/*.ts"],
        rules: {
          "effect/no-ambient-authority": [
            "error",
            { technology: "effect-v4", role: "pure-library", platform: "portable" },
          ],
        },
      },
      {
        files: ["apps/worker/src/**/*.ts", "packages/adapters/**/*.ts"],
        rules: {
          "effect/no-ambient-authority": [
            "error",
            { technology: "effect-v4", role: "service", platform: "portable" },
          ],
        },
      },
      { files: ["**/*.test.ts"], rules: { "effect/no-ambient-authority": "off" } },
      {
        files: [
          "apps/worker/src/runtime/**/*.ts",
          "apps/worker/src/index.ts",
          "apps/worker/src/ingestion/SourceLeaseObject.ts",
          "apps/worker/src/accounts/hash.ts",
          "apps/worker/src/db/{FakeD1,Sqlite}.ts",
          "apps/worker/src/testSupport/**/*.ts",
        ],
        rules: { "effect/no-ambient-authority": "off" },
      },
    ],
    jsPlugins: [{ name: "effect", specifier: "@phibkro/oxlint-effect-plugin" }],
  },
  run: {
    tasks: {
      // Environment: installs, git hook dispatcher (.vite-hooks), pinned Foldkit checkout (scripts/setup.sh).
      setup: { command: "bash scripts/setup.sh && vp config --no-agent", cache: false },

      // Static gates. Cached: each reads only tracked inputs that Vite Task fingerprints automatically
      // (guide/automatic-data-tracking.md); a planted failure after a warm cache is in evidence/WS-0027 r2.
      typecheck: "tsc --noEmit",
      "effect:check": "bun run scripts/ts/effect-diagnostics.ts",
      "schema:check": "bun run scripts/ts/schema.ts",
      "catalog:check": "bun run scripts/ts/catalog.ts",
      "bundle:check": `${bundle} > /dev/null`,
      // Not cached: it compares imports against git's index, which is not a file input.
      "imports:check": { command: "bun run scripts/ts/tracked-imports.ts", cache: false },

      // Generators (write db/ files).
      schema: { command: "bun run scripts/ts/schema.ts --emit", cache: false },
      catalog: { command: "bun run scripts/ts/catalog.ts --emit", cache: false },

      // Vitest 4, both suites, unchanged. Not cached: a replayed pass is not a test run.
      test: { command: `${bunSuite} && ${workerdSuite}`, cache: false },
      "test:bun": { command: bunSuite, cache: false },
      "test:workers": { command: workerdSuite, cache: false },
      "test:watch": { command: "bun node_modules/vitest/vitest.mjs", cache: false },
      coverage: { command: `${bunSuite} --coverage && ${workerdSuite} --coverage`, cache: false },
      e2e: { command: "playwright test --config e2e/playwright.config.ts --pass-with-no-tests", cache: false },

      // Repository, credential and script policy gates (the old `just check` / scripts/check.sh).
      policy: {
        command: [
          "python3 scripts/check_repo.py",
          "bash scripts/test_nav_key.sh",
          "bash scripts/test_deploy_preflight.sh",
          "python3 scripts/test_environment_safety.py",
          "python3 scripts/test_d1_migrations.py",
          "python3 scripts/test_d1_restore.py",
          // Vite Task parses simple commands itself and does not expand globs, so the glob goes through bash.
          "bash -c 'shellcheck scripts/*.sh .vite-hooks/pre-commit'",
        ],
        cache: false,
      },

      // The old `just verify`: setup, policy, then every workspace gate of the old `bun run check`, in its order.
      verify: {
        command:
          "vp run setup && vp run policy && vp check && vp run imports:check && vp run typecheck && " +
          "vp run effect:check && vp run schema:check && vp run catalog:check && vp run bundle:check && vp run coverage",
        cache: false,
      },

      // Operator entry points. They call the kept scripts; deploys run `verify` first (dependsOn) and stop if it fails.
      dev: { command: "bash scripts/preview.sh", cache: false, dependsOn: ["setup"] },
      "deploy-preview": { command: "bash scripts/deploy-preview.sh", cache: false, dependsOn: ["setup"] },
      deploy: { command: "bash scripts/deploy.sh staging", cache: false, dependsOn: ["verify"] },
      "deploy-production": { command: "bash scripts/deploy.sh production", cache: false, dependsOn: ["verify"] },
      "nav-key": { command: "bash scripts/configure-nav-key.sh", cache: false, dependsOn: ["setup"] },
      "nav-key-cloudflare": { command: "bash scripts/configure-nav-key.sh --cloudflare", cache: false, dependsOn: ["setup"] },
      qualification: { command: "python3 scripts/qualify.py", cache: false, dependsOn: ["setup"] },
      "d1-restore": { command: "python3 scripts/restore-d1.py --confirm", cache: false, dependsOn: ["setup"] },
      soak: { command: "python3 scripts/soak.py", cache: false, dependsOn: ["setup"] },
      clean: {
        command: "rm -rf .wrangler .artifacts .deploy .preview node_modules apps/web infra/node_modules infra/.alchemy",
        cache: false,
      },
    },
  },
});
