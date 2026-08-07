/**
 * Fails when a tracked file imports one that git does not have.
 *
 *   bun run scripts/ts/tracked-imports.ts
 *
 * Every other gate in this repository runs against the working tree, which is
 * exactly why none of them caught the bug this exists for: `git commit -a`
 * stages modifications to tracked files and does not add new ones, so three
 * commits shipped an `index.ts` importing a `Telemetry.ts` that was never
 * added. On disk it was there, so the type-checker, the tests, and the bundle
 * check were all perfectly happy. The repository was unbuildable from a clean
 * checkout for six commits.
 *
 * Running more tests in the hook would not have found it. The question is not
 * "does this tree work" but "does the tree git would hand someone else work",
 * and only git can answer that — hence comparing imports against `ls-files`
 * rather than against the filesystem.
 *
 * Cheap on purpose: no build, no module resolution beyond joining paths, so it
 * belongs in front of the slow gates rather than behind them.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");

const trackedFiles = (): ReadonlySet<string> =>
  new Set(
    execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      .split("\0")
      .filter((line) => line.length > 0),
  );

/**
 * Relative specifiers only. A bare specifier (`effect/Layer`,
 * `@job-index/domain/Job`) resolves through node_modules or a path alias,
 * neither of which is git's business — and a missing dependency is a failure
 * every other gate already catches loudly.
 */
const SPECIFIERS: ReadonlyArray<RegExp> = [
  // `import x from "./y.ts"`, `export { x } from "./y.ts"` — the `from` must
  // not be followed by `(`, or a local helper named `from` reads as an import.
  // vitest.config.ts has exactly such a helper, and the first version of this
  // script reported its alias templates as missing files.
  /(?:^|[\s};])from\s*["'](\.[^"']*)["']/gm,
  /(?:^|[\s;])import\s+["'](\.[^"']*)["']/gm,
  /\bimport\s*\(\s*["'](\.[^"']*)["']/g,
];

const resolveSpecifier = (fromFile: string, specifier: string): string | undefined => {
  // Vite's `?raw`/`?url`/etc. import-suffix convention (`vitest.workers.config.ts`'s
  // project uses `?raw` to inline `db/schema.sql` as text — workerd has no
  // filesystem, so a runtime read is not an option there) names a real file
  // on disk, plus a query the bundler strips before resolving. Stripped here
  // for the same reason: git only tracks the file, never the suffix.
  const withoutQuery = specifier.replace(/\?.*$/, "");
  const base = path.resolve(path.dirname(path.join(ROOT, fromFile)), withoutQuery);
  // The repository imports with explicit `.ts` extensions, but a directory
  // import or an extensionless one should resolve the way a bundler would
  // rather than be reported as missing.
  const candidates = [base, `${base}.ts`, path.join(base, "index.ts")];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  return found === undefined ? undefined : path.relative(ROOT, found);
};

/**
 * Comments are not code, and this file proved it: its own docstring shows an
 * example import, which the first version reported as a missing file. A gate
 * whose first two failures were both false positives is a gate on its way to
 * being switched off.
 */
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const tracked = trackedFiles();
const sources = [...tracked].filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts"));

const problems: Array<string> = [];

for (const file of sources) {
  const text = withoutComments(fs.readFileSync(path.join(ROOT, file), "utf8"));
  const seen = new Set<string>();
  for (const pattern of SPECIFIERS) {
    for (const match of text.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier === undefined || seen.has(specifier)) {
        continue;
      }
      seen.add(specifier);
      const resolved = resolveSpecifier(file, specifier);
      if (resolved === undefined) {
        problems.push(`${file} imports ${specifier}, which does not exist`);
      } else if (!tracked.has(resolved)) {
        problems.push(`${file} imports ${specifier} (${resolved}), which git does not track`);
      }
    }
  }
}

if (problems.length > 0) {
  process.stderr.write("imports that a clean checkout could not resolve:\n");
  for (const problem of problems) {
    process.stderr.write(`  ${problem}\n`);
  }
  process.stderr.write("\nlikely cause: `git add` was never run for a new file.\n");
  process.exit(1);
}

process.stdout.write(`every import in ${sources.length} tracked files resolves to a tracked file\n`);
