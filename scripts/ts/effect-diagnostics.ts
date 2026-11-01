/**
 * Fails on @effect/language-service error or warning diagnostics that are not
 * listed in tools/quality/effect-exceptions.json (WS-0026).
 *
 *   bun run scripts/ts/effect-diagnostics.ts
 *
 * Integration: the package's documented `effect-language-service diagnostics`
 * CLI (README, "effect-language-service diagnostics"), run against the root
 * tsconfig.json whose compilerOptions.plugins names the plugin. It reads the
 * plugin config without patching node_modules/typescript, so `tsc` stays stock.
 * The CLI's own `--strict` would fail on any warning; this wrapper adds the
 * exceptions registry and keeps it in sync (stale or miscounted entries fail).
 * Suggestion-severity ("message") diagnostics are advisory and not gated.
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const REGISTRY = path.join(ROOT, "tools/quality/effect-exceptions.json");

interface Diagnostic {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly severity: string;
  readonly name: string;
  readonly message: string;
}
interface Exception {
  readonly id: string;
  readonly file: string;
  readonly rule: string;
  readonly count: number;
  readonly reason: string;
  readonly retirement: string;
}

const run = (): ReadonlyArray<Diagnostic> => {
  // The CLI exits 1 when it reports errors, so the exit status is not a failure
  // here; unparseable output is.
  const result = spawnSync(
    path.join(ROOT, "node_modules/.bin/effect-language-service"),
    [
      "diagnostics",
      "--project",
      path.join(ROOT, "tsconfig.json"),
      "--format",
      "json",
      "--severity",
      "error,warning",
    ],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  try {
    return (JSON.parse(result.stdout) as { diagnostics: Diagnostic[] }).diagnostics;
  } catch {
    throw new Error(
      `effect-language-service produced no JSON (status ${result.status}): ${result.stderr}`,
    );
  }
};

const registry = JSON.parse(fs.readFileSync(REGISTRY, "utf8")) as { exceptions: Exception[] };
const problems: string[] = [];

for (const e of registry.exceptions) {
  for (const field of ["id", "file", "rule", "reason", "retirement"] as const) {
    if (typeof e[field] !== "string" || e[field].trim() === "")
      problems.push(`${e.id ?? "?"}: missing ${field}`);
  }
  if (!Number.isInteger(e.count) || e.count < 1)
    problems.push(`${e.id}: count must be a positive integer`);
}

const found = new Map<string, Diagnostic[]>();
for (const d of run()) {
  const key = `${path.relative(ROOT, d.file)}\u0000${d.name}`;
  found.set(key, [...(found.get(key) ?? []), d]);
}

const claimed = new Set<string>();
for (const e of registry.exceptions) {
  const key = `${e.file}\u0000${e.rule}`;
  claimed.add(key);
  const n = found.get(key)?.length ?? 0;
  if (n === 0)
    problems.push(`${e.id}: stale exception, no ${e.rule} finding in ${e.file}; remove it`);
  else if (n !== e.count)
    problems.push(`${e.id}: expected ${e.count} ${e.rule} finding(s) in ${e.file}, found ${n}`);
}
for (const [key, list] of found) {
  if (claimed.has(key)) continue;
  for (const d of list) {
    problems.push(
      `${path.relative(ROOT, d.file)}:${d.line}:${d.column} ${d.severity} effect(${d.name}): ${d.message}`,
    );
  }
}

if (problems.length > 0) {
  process.stderr.write("effect-diagnostics: FAILED\n");
  for (const p of problems) process.stderr.write(`  ${p}\n`);
  process.exit(1);
}
const total = [...found.values()].reduce((n, l) => n + l.length, 0);
process.stdout.write(
  `effect-diagnostics: ok (${total} excepted finding(s), ${registry.exceptions.length} registry entries)\n`,
);
