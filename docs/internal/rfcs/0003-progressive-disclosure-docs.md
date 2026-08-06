# RFC 0003: Progressive-disclosure documentation

- Status: Accepted
- Authors: Project maintainers
- Created: 2026-08-05
- Updated: 2026-08-05
- Work scope: Documentation foundation
- Review owners: Human product owner; documentation reviewer
- Tracking issue: Not yet created
- Implementation PR: 094cc51
- Supersedes: None
- Superseded by: None

## Summary

Use three complementary documentation structures: public Diátaxis documentation, detailed internal engineering and governance documents, and a concise six-file Cline-inspired memory bank that projects current context and links to authoritative detail.

## Motivation

Agents need stable intent and current state across sessions, but loading every design document wastes context and increases the chance of using stale information. Human users also need documentation organized around their task rather than around the repository's internal structure.

## Goals

- Give humans and agents a small, reliable orientation layer.
- Separate public learning, task, lookup, and explanation needs.
- Keep detailed design and evidence retrievable without always loading it.
- Make authority and freshness explicit.

## Non-goals

- Treating memory summaries as authoritative policy.
- Storing raw transcripts as curated project state.
- Duplicating the same detailed content across public, internal, and memory layers.

## Guide-level explanation

A new contributor starts with `README.md`, `AGENTS.md`, and `docs/index.md`. An agent additionally reads the six memory-bank files. Deeper architecture, RFC, lifecycle, or evidence documents are opened only when the current task requires them.

Public users navigate documentation through tutorials, how-to guides, reference, and explanation sections.

## Reference-level explanation

Progressive levels are:

1. Repository orientation: `README.md` and `AGENTS.md`.
2. Current context: six memory-bank files.
3. Task-specific public or internal documentation.
4. RFCs, machine-readable policy, schemas, and detailed design.
5. Raw evidence, traces, datasets, and transcripts.

Authority precedence is:

1. Approved WorkScope revision and gate decision.
2. Machine-readable policy.
3. Accepted RFCs.
4. Internal architecture and lifecycle documentation.
5. Public documentation.
6. Memory-bank projections.
7. Raw transcripts and historical evidence.

## ADLC and operational impact

Closure gates require memory updates when project state changes. Architectural changes require an RFC and corresponding projection update. User-visible changes require appropriate Diátaxis documentation. Repository checks enforce links and memory size budgets.

## Security, privacy, and capabilities

Raw evidence and transcripts may contain sensitive data and must not be indiscriminately loaded or published. Progressive disclosure also limits unnecessary exposure of credentials, personal information, and privileged operational context.

## Drawbacks

- Information can become inconsistent across layers.
- Contributors must decide where a document belongs.
- Concise memory projections require ongoing curation.

## Rationale and alternatives

**Single wiki:** easy to search but weak in authority, versioning, and context budgeting.

**README-only:** too shallow for architecture and lifecycle continuity.

**Load all docs for every agent task:** costly and prone to stale-context confusion.

The layered model is selected because it balances continuity, navigability, and context economy.

## Prior art

The public structure follows Diátaxis. The memory layer follows Cline's six-file Memory Bank pattern while making its projection status and authority limits explicit.

## Unresolved questions

- When automated freshness checks should require human review.
- Whether generated indexes should supplement manual links.

## Future possibilities

- Task-specific generated context manifests.
- Search and retrieval over internal documents and evidence.
- Automatic detection of stale memory projections.

## Implementation plan

The initial repository already contains the three documentation layers, link validation, and context budgets. Future work adds documentation checks when code and APIs become available.

## Verification and evidence

- All required memory files exist and remain under their context budget.
- Relative links resolve.
- Accepted RFC and policy changes update linked summaries.
- Public documents remain classified by primary Diátaxis purpose.

## Rollout and rollback

This is a repository convention with no runtime rollout. A replacement model requires a superseding RFC and migration of indexes and authority references.

## Decision record

- Decision: Accepted
- Decision date: 2026-08-05
- Decision owner: Human product owner
- Final rationale: Layered progressive disclosure preserves continuity without forcing every task to ingest the full project history.
- Dissent or residual concerns: Freshness still depends partly on disciplined closure practice.
- Required follow-up: Enforce RFC structure and keep memory projections current during implementation.

## Amendments

- 2026-08-05: Replaced references to standalone ADRs with accepted RFCs as the architectural decision record.
