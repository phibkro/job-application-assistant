import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WS-0022 §8 (owner decision 2026-11-01, "Effect at the edge, pure core"): the observation IR, the workload pass, the
 * projection and query logic, the NAV importer and the ingestion run machine are plain functions with no Effect
 * services. This scans their import closure (value *and* type imports, relative and `@job-index/*` alias) and fails
 * on any external module outside `ALLOWED`: schema and data constructors, not `Effect`, `Layer`, `Context`, `Config`,
 * clocks or the `effect` barrel. The pg-outbox `effectBoundary` pattern, with control twins that must be caught.
 */

const ROOT = path.resolve(import.meta.dirname, "../../../..");

export const PURE_CORE = [
  "packages/domain/src/observation/Ir.ts",
  "packages/domain/src/observation/Workload.ts",
  "packages/domain/src/observation/Projection.ts",
  "packages/domain/src/observation/Query.ts",
  "packages/domain/src/observation/Rows.ts",
  "packages/adapters/nav/src/observe.ts",
  "apps/worker/src/ingestion/run.ts",
] as const;

/** Data and schema only: none of these is, provides or requires an Effect service. */
const ALLOWED = new Set([
  "effect/Schema",
  "effect/schema/Model",
  "effect/Data",
  "effect/Result",
  "@noble/hashes/sha2.js",
  "@noble/hashes/utils.js",
]);

const ALIASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^@job-index\/domain\/(.*)$/, "packages/domain/src/$1.ts"],
  [/^@job-index\/worker\/(.*)$/, "apps/worker/src/$1.ts"],
  [/^@job-index\/adapters\/shared\/(.*)$/, "packages/adapters/shared/src/$1.ts"],
];

const SPECIFIER =
  /(?:^|[\s;}])(?:import|export)\b[^"'`;]*?from\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/gm;

const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const specifiers = (source: string): ReadonlyArray<string> =>
  [...withoutComments(source).matchAll(SPECIFIER)].map((m) => (m[1] ?? m[2]) as string);

const resolveLocal = (root: string, from: string, specifier: string): string | undefined => {
  if (specifier.startsWith("."))
    return path.relative(root, path.resolve(path.dirname(path.join(root, from)), specifier));
  for (const [pattern, target] of ALIASES) {
    if (pattern.test(specifier)) return specifier.replace(pattern, target);
  }
  return undefined;
};

/** Every disallowed external import reachable from `entries`, as `file: imports specifier`. */
export const violations = (root: string, entries: ReadonlyArray<string>): ReadonlyArray<string> => {
  const seen = new Set<string>();
  const found: Array<string> = [];
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const absolute = path.join(root, file);
    if (!existsSync(absolute)) {
      found.push(`${file}: does not exist`);
      continue;
    }
    for (const specifier of specifiers(readFileSync(absolute, "utf8"))) {
      const local = resolveLocal(root, file, specifier);
      if (local !== undefined) queue.push(local);
      else if (!ALLOWED.has(specifier)) found.push(`${file}: imports ${specifier}`);
    }
  }
  return found.toSorted();
};

const HELPER = "./helper.ts";

const scratch = (
  files: Readonly<Record<string, string>>,
  run: (root: string) => ReadonlyArray<string>,
) => {
  const root = mkdtempSync(path.join(tmpdir(), "ws22-boundary-"));
  try {
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), text);
    }
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

describe("pure-core boundary (WS-0022 §8)", () => {
  it("the IR, workload pass, projection, query, importer and run machine import no Effect service, transitively", () => {
    expect(violations(ROOT, PURE_CORE)).toEqual([]);
  });

  it("control twin: a direct, a transitive, a type-only and a barrel import of Effect services are all caught", () => {
    const found = scratch(
      {
        "core/a.ts": 'import * as Effect from "effect/Effect";\nexport const a = Effect.void;\n',
        // The specifier is interpolated so `scripts/ts/tracked-imports.ts` does not read this fixture text as a
        // real import of a file git does not track.
        "core/b.ts": `import { helper } from ${JSON.stringify(HELPER)};\nexport const b = helper;\n`,
        "core/helper.ts": 'import { Layer } from "effect";\nexport const helper = Layer;\n',
        "core/c.ts":
          'import type * as Context from "effect/Context";\nexport type C = Context.Context<never>;\n',
        "core/d.ts":
          'export { Config } from "effect";\nconst late = await import("effect/Clock");\n',
        "core/e.ts":
          '// import * as Effect from "effect/Effect"\nimport * as Schema from "effect/Schema";\nexport const e = Schema.String;\n',
      },
      (root) => violations(root, ["core/a.ts", "core/b.ts", "core/c.ts", "core/d.ts", "core/e.ts"]),
    );
    expect(found).toEqual([
      "core/a.ts: imports effect/Effect",
      "core/c.ts: imports effect/Context",
      "core/d.ts: imports effect",
      "core/d.ts: imports effect/Clock",
      "core/helper.ts: imports effect",
    ]);
  });

  it("control twin: the real edge modules (store, collect) are reported, so the scan is not vacuous", () => {
    expect(violations(ROOT, ["apps/worker/src/observations/store.ts"])).toContain(
      "apps/worker/src/observations/store.ts: imports effect/Effect",
    );
    expect(violations(ROOT, ["apps/worker/src/ingestion/collect.ts"]).length).toBeGreaterThan(0);
  });
});
