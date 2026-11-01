import { createRequire } from "node:module";
import { defineConfig } from "vite-plus";

/**
 * Foldkit's own lint rules for the index client (WS-0025): the plugin's
 * `recommended.json`, scoped to `apps/index-web/` with its own test/entry
 * overrides, so `vp check` enforces the same invariants the Foldkit scaffold does.
 */
interface OxlintOverride {
  readonly files: ReadonlyArray<string>;
  readonly excludeFiles?: ReadonlyArray<string>;
  readonly rules: Record<string, string>;
}
const foldkitRecommended = createRequire(import.meta.url)("@foldkit/oxlint-plugin/recommended.json") as {
  readonly rules: Record<string, string>;
  readonly overrides: ReadonlyArray<OxlintOverride>;
};
const inIndexWeb = (glob: string): string => glob.replace(/^\*\*\//, "apps/index-web/**/");
const foldkitOverrides = [
  { files: ["apps/index-web/**/*.ts"], rules: foldkitRecommended.rules },
  ...foldkitRecommended.overrides.map((override) => ({
    files: override.files.map(inIndexWeb),
    rules: override.rules,
  })),
];

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
/**
 * Remote mutation runs only in the pinned toolchain: devenv exports DEVENV_ROOT inside `devenv shell`, so a deploy
 * started from a host shell (for example `bunx vp run deploy`) fails closed before any gate or Cloudflare call.
 */
const requireDevenv =
  "bash -c 'test -n \"$DEVENV_ROOT\" || { echo \"deploys must run inside the pinned toolchain: devenv shell -- vp run deploy\" >&2; exit 1; }'";
const bundle =
  'bun build apps/worker/src/index.ts --target=browser --conditions=workerd --conditions=worker --external "cloudflare:*"';

export default defineConfig({
  fmt: {
    // Today's scope: `oxfmt --check packages apps`. Everything at the root except those two is ignored.
    ignorePatterns: ["/*", "!/packages/", "!/apps/", "/apps/index-web/dist/"],
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
    ignorePatterns: ["node_modules", "infra/node_modules", "target", ".wrangler", ".artifacts", "crates", "apps/index-web/dist"],
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
      {
        // WS-0022 §8: the pure core is immutable by lint as well as by the boundary test
        // (packages/domain/src/observation/boundary.test.ts lists the same files). oxlint-plugin-immutable is AST-only:
        // shallow readonly, no deep-immutability or type-aware checks.
        files: [
          "packages/domain/src/observation/{Ir,Workload,Projection,Query,Rows}.ts",
          "packages/adapters/nav/src/observe.ts",
          "apps/worker/src/ingestion/run.ts",
        ],
        rules: {
          "immutable/no-let": "error",
          "immutable/immutable-data": "error",
          "immutable/no-throw-statements": "error",
          "immutable/readonly-type": "error",
          "immutable/type-declaration-immutability": "error",
        },
      },
      { files: ["**/*.test.ts"], rules: { "effect/no-ambient-authority": "off" } },
      ...foldkitOverrides,
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
    jsPlugins: [
      { name: "effect", specifier: "@phibkro/oxlint-effect-plugin" },
      { name: "foldkit", specifier: "@foldkit/oxlint-plugin" },
      { name: "immutable", specifier: "oxlint-plugin-immutable" },
    ],
  },
  run: {
    tasks: {
      // Environment: installs, git hook dispatcher (.vite-hooks), pinned Foldkit checkout (scripts/setup.sh).
      setup: { command: "bash scripts/setup.sh && vp config --no-agent", cache: false },

      // Static gates. Only `typecheck` is cached: tsc runs on Node, and Vite Task's automatic file tracking
      // (guide/automatic-data-tracking.md) sees its reads; a planted type error after a warm cache is a miss.
      // Tasks run by Bun are NOT cached: tracking does not see the files Bun's module loader and bundler read,
      // so an edited domain model or Worker source replayed a stale pass (evidence/WS-0027, r2 §4).
      typecheck: "tsc --noEmit",
      "effect:check": { command: "bun run scripts/ts/effect-diagnostics.ts", cache: false },
      "schema:check": { command: "bun run scripts/ts/schema.ts", cache: false },
      "catalog:check": { command: "bun run scripts/ts/catalog.ts", cache: false },
      "bundle:check": { command: `${bundle} > /dev/null`, cache: false },
      // The index client (WS-0025): the production build the Worker serves as its assets.
      "web:build": { command: "bash scripts/build-index-web.sh", cache: false },
      // Compares imports against git's index, which is not a file input either.
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
      // No `--pass-with-no-tests` (WS-0021@4 review F4): a mis-configured suite that finds no spec must fail.
      e2e: { command: "playwright test --config e2e/playwright.config.ts", cache: false },

      // Repository, credential and script policy gates (the old `just check` / scripts/check.sh).
      policy: {
        command: [
          "python3 scripts/check_repo.py",
          "bash scripts/test_nav_key.sh",
          "bash scripts/test_deploy_preflight.sh",
          "bash scripts/test_smoke_preview.sh",
          "bash scripts/test_seed_preview_db.sh",
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
          "vp run effect:check && vp run schema:check && vp run catalog:check && vp run bundle:check && vp run web:build && " +
          "vp run coverage",
        cache: false,
      },

      // Operator entry points. They call the kept scripts. A deploy requires devenv, then runs `verify` inside its own
      // command (not `dependsOn`, which `vp run --ignore-depends-on` would skip) and stops if either fails.
      dev: { command: "bash scripts/preview.sh", cache: false, dependsOn: ["setup"] },
      "deploy-preview": { command: "bash scripts/deploy-preview.sh", cache: false, dependsOn: ["setup"] },
      // WS-0029@2 pass B: the owner deploys the PR Preview host (parent Worker + shared preview D1) from main.
      "deploy-preview-host": {
        command: `${requireDevenv} && bash scripts/deploy-preview-host.sh`,
        cache: false,
        dependsOn: ["setup"],
      },
      deploy: { command: `${requireDevenv} && vp run verify && bash scripts/deploy.sh staging`, cache: false },
      "deploy-production": { command: `${requireDevenv} && vp run verify && bash scripts/deploy.sh production`, cache: false },
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
