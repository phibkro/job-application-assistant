# better-auth-effect-adapter

A [Better Auth](https://www.better-auth.com) database adapter written against
[Effect](https://effect.website) — for SQLite and D1, with no Drizzle or
Kysely dependency.

## Why this exists

Better Auth ships adapters for Drizzle, Kysely, Prisma, MongoDB, and an
in-memory store, but has no first-party path for a project whose SQL layer is
neither an ORM nor a query builder. This package is that path: it implements
Better Auth's `createAdapterFactory` contract directly against a two-method
SQL execution port, so a project whose database access is already "a
statement and its bindings" doesn't have to adopt a second data-access stack
just to get authentication.

## The executor port

The package asks a consumer for exactly one thing:

```ts
interface Executor {
  readonly query: <A>(
    sql: string,
    bindings: ReadonlyArray<unknown>,
  ) => Effect.Effect<ReadonlyArray<A>>;
  readonly run: (sql: string, bindings: ReadonlyArray<unknown>) => Effect.Effect<void>;
}
```

No `transaction`, no `atomic`. SQLite and D1 have no interactive `BEGIN` an
application can hold open across `await` points — D1's Workers binding offers
only `batch()`, a fixed list of statements decided in advance — so a port
promising an interactive transaction would promise something the target
dialect cannot deliver. Every mutation this adapter issues is a single
parameterised statement, using `RETURNING` to read back what changed, which is
why `query`/`run` is always enough.

```ts
import { effectAdapter } from "better-auth-effect-adapter";
import { betterAuth } from "better-auth/minimal"; // no Kysely

const auth = betterAuth({
  database: effectAdapter(myExecutor),
});
```

Bring your own `Executor`:

- Backed by `bun:sqlite`, `better-sqlite3`, or any synchronous driver: wrap
  `.query()`/`.run()` in `Effect.sync`.
- Backed by a Cloudflare D1 binding: `env.DB.prepare(sql).bind(...bindings)`,
  `.all()` for `query`, `.run()` for `run`.
- Backed by a project's own narrow SQL service (this is how job-index itself
  will use it): adapt that service's shape to `Executor` in a couple of
  lines.
- Backed by `effect/unstable/sql`'s `SqlClient` — see below.

### `better-auth-effect-adapter/sql-client`

A second entry point, not a dependency of the package root:

```ts
import { executorFromSqlClient } from "better-auth-effect-adapter/sql-client";

const executor = executorFromSqlClient(mySqlClient); // effect/unstable/sql SqlClient
```

This is a separate import path — not pulled in by the root package — so a
consumer who never installs `effect/unstable/sql` (a D1 binding or
`bun:sqlite` directly, say) never pays for it. `SqlClient.unsafe` fails with a
typed `SqlError`; this binding runs it through `Effect.orDie`, matching the
root `Executor` port's promise of `never` in its error channel — a failed
statement is a defect here, not a modelled failure, the same choice
job-index's own `Database` service makes.

## The four tables

```ts
import { User, Session, Account, Verification } from "better-auth-effect-adapter";
```

`Model.Class` definitions (`effect/unstable/schema/Model`) for exactly the
four tables Better Auth's core reads and writes. Field names, nullability,
and which four tables exist are sourced from `@better-auth/core`'s own
resolved schema (`getAuthTables({})`, better-auth 1.6.26) — not guessed.
`emailVerified` is `Model.BooleanSqlite`; every timestamp is
`Model.DateTimeInsert`/`Model.DateTimeUpdate`; nullable columns use
`Model.FieldOption`; credential-adjacent columns (`account.password`,
`account.accessToken`, `account.refreshToken`, `account.idToken`) use
`Model.Sensitive`, matching the treatment this repository already gives its
own `Session.tokenHash`.

A consumer generating its schema from `Model.Class` declarations (the way
job-index's own `scripts/ts/schema.ts` does) reads these the same way it
reads its own domain models — one column-name authority, not Better Auth's
migration CLI running beside a hand-written schema. **Wiring these into a
specific project's schema generator is a follow-up for that project, not done
by this package** — it only exports the declarations.

Plugin-added fields (organisations, two-factor, etc.) are not covered: those
tables exist only once a specific plugin is configured, so there is no fixed
set to declare here. `Adapter.ts`'s `createSchema` implementation (below)
handles them generically at runtime, and a consumer needing the same at
schema-generation time can call `better-auth/db`'s `getAuthTables(options)`
directly the way this package's own `createSchema` and test harness do.

## Scope: SQLite / D1 SQL, not a portable dialect

This package targets SQLite and D1 syntax specifically and has only been run
against those. It uses:

- `RETURNING` on `UPDATE`/`DELETE` (SQLite ≥ 3.35, and D1).
- `instr()`/`substr()` for `contains`/`starts_with`/`ends_with` — chosen
  specifically to avoid `LIKE`'s wildcard-escaping requirement (see
  `Where.ts`).
- `INTEGER`/`TEXT` column affinities in the `createSchema` output
  (`Migrate.ts`).

None of this is Postgres- or MySQL-valid. A package claiming dialect
independence without having tested one is worse than a package that states
its scope, so: this one states its scope. Porting to another dialect is a
real, separate piece of work (parameterisation syntax, `RETURNING` support,
`LIKE`/regex semantics all differ), not a drop-in.

## Version policy — Effect v4 beta, pinned exactly

This package targets **Effect v4 beta** and will break in step with it.

- `effect` is a peer dependency pinned to the **exact** beta this package was
  built and tested against (`4.0.0-beta.104`) — not a caret range. A caret
  range would promise compatibility with betas this package has never run
  against, and Effect v4 betas break arbitrarily between releases.
- `better-auth` is a peer dependency on `^1.6.26` — a normal semver range,
  since better-auth 1.x is a stable release line, not a beta.
- Expect breaking changes here in lockstep with Effect v4 betas. Pin exactly;
  do not assume forward compatibility across a beta bump without re-running
  the conformance suite.

## Status

`"private": true`. This package is not published. A published name, npm
scope, and the decision to publish at all are the operator's calls — not
made here.

**Licence note:** this package is MIT, licensed separately from the
repository it currently lives in, which is `AGPL-3.0-or-later`. See `LICENSE`
in this directory. If it is ever extracted to its own repository, that
separation needs no further action; while it lives here, it is the one MIT
corner of an AGPL tree.

## Testing

```bash
bun test packages/better-auth-effect-adapter/src
```

Two test files:

- `Where.test.ts` — unit tests for the where-clause translator, including a
  direct check that a value containing a quote is bound as data and never
  interpolated into the SQL text.
- `Adapter.conformance.test.ts` — the official `@better-auth/test-utils`
  conformance suite, run against a real `bun:sqlite` engine. See the file's
  own comments for exactly which suites run, and the doc comment on the four
  disabled tests for the one SQL-versus-JS-object limitation this adapter
  cannot close (a `returned`-adjacent field a fixture never sets round-trips
  as SQL `NULL`, not as an absent key — see that comment for the full
  reasoning).
