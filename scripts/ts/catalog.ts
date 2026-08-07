/**
 * Emits the source-catalogue seed from the researched platform index.
 *
 *   bun run scripts/ts/catalog.ts --emit    # write db/catalog-seed.sql
 *   bun run scripts/ts/catalog.ts           # fail if the file disagrees
 *
 * `research/input/platform-index.csv` is the source of truth for which
 * platforms exist. `research/observations/source-probe.json` is the source of
 * truth for how each one may be read — established by probing it, not by
 * anyone's opinion. This joins the two into rows for `source_catalog`.
 *
 * The two are kept apart deliberately, and the join direction matters: an
 * observation may establish that a platform is only readable by driving a
 * browser, but no observation can establish that a platform *permits*
 * automated submission. That is a person reading terms of service. So the
 * tier comes from evidence and the policy does not — `Unreviewed` is the
 * default and it forbids automation, which is what `Policy` promises.
 *
 * The predecessor of this script generated a migration for the Rust service's
 * wider table. That service is deleted; this writes the columns
 * `db/schema.sql` actually declares.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { CatalogRecord } from "../../packages/domain/src/Source.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const INDEX = path.join(ROOT, "research/input/platform-index.csv");
const OBSERVATIONS = path.join(ROOT, "research/observations/source-probe.json");
const TARGET = path.join(ROOT, "db/catalog-seed.sql");

/** Minimal RFC 4180: quoted fields, doubled quotes, embedded commas and newlines. */
const parseCsv = (text: string): ReadonlyArray<ReadonlyArray<string>> => {
  const rows: Array<Array<string>> = [];
  let row: Array<string> = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
};

/** Norwegian letters fold to their ASCII pairs so an id stays URL-safe. */
const slug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replaceAll("æ", "ae")
    .replaceAll("ø", "o")
    .replaceAll("å", "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "unnamed";

const quote = (value: string): string => `'${value.replaceAll("'", "''")}'`;

interface Observation {
  readonly acquisition_tier?: string;
  readonly listings_url?: string;
  readonly observed_at?: string;
}

const observations = ((): Record<string, Observation> => {
  if (!fs.existsSync(OBSERVATIONS)) {
    return {};
  }
  const parsed = JSON.parse(fs.readFileSync(OBSERVATIONS, "utf8")) as {
    platforms?: Record<string, Observation>;
  };
  return parsed.platforms ?? {};
})();

const TIERS: Record<string, string> = {
  feed: "Feed",
  scripted: "Scripted",
  agent: "Agent",
};

const rows = parseCsv(fs.readFileSync(INDEX, "utf8"));
const header = rows[0] ?? [];
const at = (name: string): number => header.findIndex((h) => h.trim() === name);
const columns = {
  platform: at("Platform"),
  category: at("Category"),
  listingsUrl: at("Listings URL"),
  priority: at("Priority"),
  confidence: at("Confidence"),
  notes: at("Notes"),
  verifiedAt: at("Verified date"),
};

const missing = Object.entries(columns).filter(([, index]) => index < 0);
if (missing.length > 0) {
  throw new Error(`platform-index.csv is missing columns: ${missing.map(([n]) => n).join(", ")}`);
}

const cell = (row: ReadonlyArray<string>, index: number): string => (row[index] ?? "").trim();

const FIELDS = Object.keys(CatalogRecord.select.fields);

const seen = new Set<string>();
const values: Array<string> = [];
const tally = { Feed: 0, Scripted: 0, Agent: 0, Unknown: 0 };

for (const row of rows.slice(1)) {
  const platform = cell(row, columns.platform);
  if (platform.length === 0) {
    continue;
  }
  const id = slug(platform);
  if (seen.has(id)) {
    throw new Error(`two platforms slug to ${id}; give one a distinct name`);
  }
  seen.add(id);

  const observed = observations[platform];
  // No observation means nobody has established how to read it. `Unknown`
  // makes ingestion refuse rather than guess — see `AcquisitionTier`.
  const tierTag = TIERS[observed?.acquisition_tier ?? ""] ?? "Unknown";
  tally[tierTag as keyof typeof tally] += 1;

  const record = {
    id,
    platform,
    category: cell(row, columns.category),
    // The observed URL wins: the sheet records where a person found the
    // listings, the probe records what actually answered.
    listingsUrl: observed?.listings_url ?? cell(row, columns.listingsUrl),
    tierTag,
    // Never derived from evidence. A person reads the terms, or it stays
    // `Unreviewed`, which forbids automated submission.
    policyTag: "Unreviewed",
    // Agent acquisition costs a browser run, so it is the paid capability.
    requiresPremium: tierTag === "Agent" ? 1 : 0,
    priority: cell(row, columns.priority),
    confidence: cell(row, columns.confidence),
    notes: cell(row, columns.notes),
    verifiedAt: observed?.observed_at ?? cell(row, columns.verifiedAt),
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  } as Record<string, string | number>;

  values.push(
    `  (${FIELDS.map((field) => {
      const value = record[field];
      return typeof value === "number" ? String(value) : quote(String(value ?? ""));
    }).join(", ")})`,
  );
}

const emitted = [
  "-- Generated by scripts/ts/catalog.ts from research/input/platform-index.csv",
  "-- and research/observations/source-probe.json. Do not edit by hand: re-run",
  "-- the generator so the researched index stays the single source of truth.",
  "--",
  "-- Timestamps are fixed rather than generation-time so that re-running with",
  "-- unchanged inputs produces an unchanged file, and a diff means the research",
  "-- changed. The database sets its own on write.",
  "",
  `INSERT OR REPLACE INTO source_catalog (${FIELDS.join(", ")}) VALUES`,
  `${values.join(",\n")};`,
  "",
].join("\n");

if (process.argv.includes("--emit")) {
  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  fs.writeFileSync(TARGET, emitted);
  const counts = Object.entries(tally)
    .filter(([, n]) => n > 0)
    .map(([tier, n]) => `${n} ${tier.toLowerCase()}`)
    .join(", ");
  process.stdout.write(`wrote db/catalog-seed.sql: ${values.length} platforms (${counts})\n`);
} else {
  const current = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, "utf8") : "";
  if (current !== emitted) {
    process.stderr.write("db/catalog-seed.sql disagrees with the researched index; run --emit\n");
    process.exit(1);
  }
  process.stdout.write(`catalogue seed matches the researched index (${values.length} platforms)\n`);
}
