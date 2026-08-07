/**
 * Emits the database snapshot from the domain models, and checks it for drift.
 *
 *   bun run scripts/ts/schema.ts --emit    # write db/schema.sql
 *   bun run scripts/ts/schema.ts           # fail if the file disagrees with the models
 *
 * Why this shape: a model's field NAMES are introspectable at runtime, but its
 * encoded types are only available at the type level — Effect v4 exposes no
 * runtime accessor for the encoded side. So column names and presence are
 * generated, while column types, keys, and indexes are declared here.
 *
 * Declared is not unchecked. Every column named by a key or an index is
 * verified against the model's own fields, so a key on a column that does not
 * exist cannot be emitted; and `apps/worker/src/db/Sqlite.ts` runs this exact
 * file through a real SQLite engine in tests, so a declared type SQLite
 * rejects fails a test rather than surviving review.
 *
 * The check runs in CI. A model that gains a field fails until the snapshot
 * agrees, which is the point — the schema is a contract, and a slot that needs
 * a new column stops and asks rather than editing it mid-flight.
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { Answer } from "../../packages/domain/src/Answer.ts"
import {
  ApplicationRecord,
  PlatformPolicyRecord,
  SavedJob,
} from "../../packages/domain/src/Applications.ts"
import { DeliveryPlatform, Submission } from "../../packages/domain/src/Delivery.ts"
import { Freshness, Judgement } from "../../packages/domain/src/Freshness.ts"
import { CanonicalJobRecord, OccurrenceRecord } from "../../packages/domain/src/Job.ts"
import { Session } from "../../packages/domain/src/Access.ts"
import { Principal } from "../../packages/domain/src/Principal.ts"
import { ProfileRecord } from "../../packages/domain/src/Profile.ts"
import { Subscription } from "../../packages/domain/src/Subscription.ts"

const ROOT = path.resolve(import.meta.dirname, "../..")
const TARGET = path.join(ROOT, "db/schema.sql")

/** Column types, declared once because they cannot be read from the model. */
const columnTypes: Record<string, string> = {
  // Identifiers and text.
  id: "TEXT NOT NULL",
  profileId: "TEXT NOT NULL",
  principalId: "TEXT NOT NULL",
  platformId: "TEXT NOT NULL",
  jobId: "TEXT NOT NULL",
  canonicalJobId: "TEXT NOT NULL",
  sourceId: "TEXT NOT NULL",
  externalId: "TEXT NOT NULL",
  canonicalKey: "TEXT NOT NULL",
  contentFingerprint: "TEXT NOT NULL",
  question: "TEXT NOT NULL",
  label: "TEXT NOT NULL",
  value: "TEXT NOT NULL",
  origin: "TEXT NOT NULL",
  name: "TEXT NOT NULL",
  hostPattern: "TEXT NOT NULL",
  applicationUrl: "TEXT NOT NULL",
  title: "TEXT NOT NULL",
  employerName: "TEXT NOT NULL",
  location: "TEXT NOT NULL",
  description: "TEXT NOT NULL",
  detail: "TEXT NOT NULL DEFAULT ''",
  outcome: "TEXT NOT NULL",
  verdict: "TEXT NOT NULL",
  reason: "TEXT NOT NULL DEFAULT ''",
  provider: "TEXT NOT NULL DEFAULT 'none'",
  providerRef: "TEXT NOT NULL DEFAULT ''",
  tokenHash: "TEXT NOT NULL",
  apiKeyHash: "TEXT NOT NULL",
  statusTag: "TEXT NOT NULL CHECK (statusTag IN ('Active', 'Closed'))",
  savedJobId: "TEXT NOT NULL",
  note: "TEXT NOT NULL DEFAULT ''",
  method: "TEXT NOT NULL CHECK (method IN ('assisted', 'automated'))",
  status: "TEXT NOT NULL CHECK (status IN ('ready', 'submitted', 'rejected', 'interview', 'offer', 'withdrawn'))",
  letter: "TEXT NOT NULL",
  generator: "TEXT NOT NULL",
  downgradeReason: "TEXT",
  notes: "TEXT NOT NULL DEFAULT ''",
  policy: "TEXT NOT NULL CHECK (policy IN ('Allowed', 'AssistedOnly', 'Prohibited', 'Unreviewed'))",
  // JSON-encoded structures.
  shape: "TEXT NOT NULL",
  tier: "TEXT NOT NULL",
  viaTier: "TEXT NOT NULL",
  mappings: "TEXT NOT NULL DEFAULT '[]'",
  unanswered: "TEXT NOT NULL DEFAULT '[]'",
  sources: "TEXT NOT NULL DEFAULT '[]'",
  cv: "TEXT NOT NULL",
  erasure: "TEXT NOT NULL",
  // Booleans stored as 0/1, per Model.BooleanSqlite.
  automationProhibited: "INTEGER NOT NULL DEFAULT 0 CHECK (automationProhibited IN (0,1))",
  humanIntervened: "INTEGER NOT NULL DEFAULT 0 CHECK (humanIntervened IN (0,1))",
  active: "INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))",
  // Numbers.
  seenThrough: "INTEGER NOT NULL DEFAULT 0",
  sequence: "INTEGER NOT NULL",
  expiresAt: "INTEGER NOT NULL",
  // Timestamps and optionals.
  createdAt: "TEXT NOT NULL",
  updatedAt: "TEXT NOT NULL",
  changedAt: "TEXT NOT NULL",
  publishedAt: "TEXT NOT NULL",
  firstSeenAt: "TEXT NOT NULL",
  lastSeenAt: "TEXT NOT NULL",
  deadline: "TEXT",
  statusClosedAt: "TEXT",
  learnedAt: "TEXT",
  revokedAt: "TEXT",
}

/**
 * Every table declares its key, because a `Model.Class` cannot express one.
 * Before this, not a single table had one: two rows for the same profile and
 * question were representable, and only convention kept them apart.
 *
 * A union rather than an optional field, so "nobody said" is not a state. A
 * log with no natural key says so — `appendOnly` leaves SQLite's implicit
 * `rowid` as the key — and that is a decision on the page instead of an
 * omission that reads identically.
 */
type Key = { readonly primaryKey: ReadonlyArray<string> } | { readonly appendOnly: "rowid" }

type TableSpec = Key & {
  readonly model: unknown
  readonly unique?: ReadonlyArray<ReadonlyArray<string>>
  readonly indexes?: ReadonlyArray<ReadonlyArray<string>>
}

const tables: Record<string, TableSpec> = {
  answers: {
    model: Answer,
    // One answer per question per profile: re-answering replaces, never appends.
    primaryKey: ["profileId", "question"],
  },
  delivery_platforms: {
    model: DeliveryPlatform,
    primaryKey: ["id"],
    indexes: [["hostPattern"]],
  },
  submissions: {
    model: Submission,
    primaryKey: ["id"],
    indexes: [["profileId"], ["platformId"]],
  },
  freshness: {
    model: Freshness,
    primaryKey: ["profileId"],
  },
  judgements: {
    model: Judgement,
    // A log: "a changed mind is history, not an overwrite", so two verdicts on
    // one job — even in the same millisecond — are two facts, not a conflict.
    appendOnly: "rowid",
    indexes: [["profileId", "jobId"]],
  },
  sessions: {
    model: Session,
    primaryKey: ["id"],
    // Two sessions cannot share a token: a collision would authenticate the
    // wrong person, which is the one failure this table must not permit.
    unique: [["tokenHash"]],
    indexes: [["principalId"]],
  },
  subscriptions: {
    model: Subscription,
    primaryKey: ["profileId"],
  },
  profiles: {
    model: ProfileRecord,
    primaryKey: ["profileId"],
  },
  principals: {
    model: Principal,
    primaryKey: ["principalId"],
    unique: [["apiKeyHash"]],
    indexes: [["profileId"]],
  },
  canonical_jobs: {
    model: CanonicalJobRecord,
    primaryKey: ["id"],
    // The canonical key *is* the deduplication rule; two rows sharing one
    // would be two canonical jobs for a single vacancy.
    unique: [["canonicalKey"]],
    indexes: [["sequence"]],
  },
  occurrences: {
    model: OccurrenceRecord,
    primaryKey: ["id"],
    // A source identifies its own advert by external id; two rows for one
    // would double-count provenance and break absence detection.
    unique: [["sourceId", "externalId"]],
    indexes: [["canonicalJobId"], ["sourceId", "active"]],
  },
  saved_jobs: {
    model: SavedJob,
    primaryKey: ["id"],
    // Bookmarking the same vacancy twice replaces the note, not the row.
    unique: [["profileId", "canonicalJobId"]],
    indexes: [["profileId"]],
  },
  applications: {
    model: ApplicationRecord,
    primaryKey: ["id"],
    indexes: [["profileId"], ["savedJobId"]],
  },
  platform_policies: {
    model: PlatformPolicyRecord,
    primaryKey: ["platformId"],
  },
}

const fieldsOf = (model: unknown): ReadonlyArray<string> => {
  const candidate = model as { select?: { fields?: object }; fields?: object }
  const fields = candidate.select?.fields ?? candidate.fields ?? {}
  return Object.keys(fields)
}

/** A key or index naming a column the model does not have is a hard error. */
const checkColumns = (
  table: string,
  what: string,
  columns: ReadonlyArray<string>,
  fields: ReadonlyArray<string>,
): void => {
  for (const column of columns) {
    if (!fields.includes(column)) {
      throw new Error(`${table}: ${what} names ${column}, which the model does not declare`)
    }
  }
}

const render = (): string => {
  const lines: Array<string> = [
    "-- Generated by scripts/ts/schema.ts from the domain models.",
    "-- Column names are derived; types, keys, and indexes are declared in that",
    "-- script and checked against the models. Re-run with --emit after a model",
    "-- changes. Nothing else may edit this file.",
    "",
  ]
  for (const [table, spec] of Object.entries(tables)) {
    const fields = fieldsOf(spec.model)
    if ("primaryKey" in spec) {
      checkColumns(table, "primary key", spec.primaryKey, fields)
    }
    const columns = fields.map((field) => {
      const type = columnTypes[field]
      if (type === undefined) {
        throw new Error(
          `no column type declared for ${table}.${field}; add one to scripts/ts/schema.ts`,
        )
      }
      return `  ${field} ${type}`
    })
    const constraints =
      "primaryKey" in spec ? [`  PRIMARY KEY (${spec.primaryKey.join(", ")})`] : []
    for (const columnSet of spec.unique ?? []) {
      checkColumns(table, "unique constraint", columnSet, fields)
      constraints.push(`  UNIQUE (${columnSet.join(", ")})`)
    }
    lines.push(
      `CREATE TABLE IF NOT EXISTS ${table} (`,
      [...columns, ...constraints].join(",\n"),
      ");",
      "",
    )
    for (const columnSet of spec.indexes ?? []) {
      checkColumns(table, "index", columnSet, fields)
      const name = `idx_${table}_${columnSet.join("_")}`
      lines.push(
        `CREATE INDEX IF NOT EXISTS ${name} ON ${table} (${columnSet.join(", ")});`,
        "",
      )
    }
  }
  return lines.join("\n")
}

const emitted = render()

if (process.argv.includes("--emit")) {
  fs.mkdirSync(path.dirname(TARGET), { recursive: true })
  fs.writeFileSync(TARGET, emitted)
  process.stdout.write(`wrote ${path.relative(ROOT, TARGET)}\n`)
} else {
  const current = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, "utf8") : ""
  if (current !== emitted) {
    process.stderr.write("db/schema.sql disagrees with the domain models; run with --emit\n")
    process.exit(1)
  }
  process.stdout.write("schema snapshot matches the domain models\n")
}
