# Adopt-research: tools and templates for a provenance-aware Norwegian vacancy index

Date: 2026-11-01. Method: about 35 web searches and fetches. Nothing was installed or built, and no repository was modified.

## Research limits (read first)

- The GitHub API and most docs hosts were blocked in this session. `api.github.com` returned 403, and `docs.datasette.io`, `docs.xtdb.com`, `navikt.github.io`, `dolthub.com` and `divyavanmahajan.github.io` did not resolve. Release dates therefore rest mostly on search-result snippets and third-party mirrors. Every such item is tagged (unv) or listed in section 4.
- "Coverage %" is my own estimate of how much of the owner's design the tool covers. It is a judgment, not a measurement. The design is: immutable facts with state, bitemporal storage, derived vacancies and sameAs, a typed query algebra, a change feed with retractions, and a UI.
- "Owned maintenance" is also my estimate. It is rated Low, Medium or High by the work the owner still carries.

## Hard-constraint findings that affect every option

1. NAV feed access and licence (`NAV feed`).
   - The feed requires a signed JWT bearer token. Use is free but needs agreement to NAV's terms of use. Registration is by email to the NAV team. Source: https://navikt.github.io/pam-stilling-feed (seen only through a search snippet; the page itself was not fetchable).
   - Each ad change creates a new feed entry. ETag and Last-Modified are recommended. Same source.
   - Finn.no ads are not in the feed. Source: https://data.norge.no/en/datasets/62409bc8-680d-3f70-98bf-d2f2beebaa50/api-navs-stillingsdatabase
   - data.norge.no lists the licence as CC BY 4.0. Source: https://data.norge.no/en/datasets/62409bc8-680d-3f70-98bf-d2f2beebaa50 (via search snippet).
   - The NAV terms of use and the CC BY 4.0 listing may disagree. Redistribution rights stay unresolved, as the owner already decided. **Unverified** whether the terms of use allow public redistribution.
   - Implication: any option that publishes NAV content publicly is blocked. That includes hosted search indexes with public keys, public Datasette, and static sites with embedded data. Everything below assumes an internal or authenticated deployment for now.
2. Personal data. Anything that indexes raw ads should drop personal contact data (named recruiter emails and phones) before it reaches an external index. Hosted SaaS indexes (Meilisearch Cloud, Typesense Cloud, Orama Cloud) move data outside the owner's control, which makes this a real constraint for them. Self-hosted or snapshot-based options are safer.
3. Teamtailor and other ATS sources have no documented, versioned public API. Third-party scraper listings say career sites publish `/jobs.rss` or a JSON feed, and one listing says the feed shape can change. Sources: https://apify.com/steadyrow/teamtailor-jobs and https://apify.com/DevilScrapes/teamtailor-jobs-scraper. **Unverified** against Teamtailor's own docs.

---

## 1. Top 5 per track

### Track A: back-end and data tools

Ranked by owned maintenance first, then coverage.

**A1. Meilisearch (Cloud or self-hosted) as a derived read index. Coverage about 15%.**
- Provides: typo-tolerant search, filters and facets, and a search-as-you-type UI ecosystem. The README lists "Filtering and faceted search". Source: https://github.com/meilisearch/meilisearch
- Licence:
  - Community Edition is MIT. Sharding and other enterprise features are BSL 1.1 and not allowed in production without a commercial agreement. Sources: https://github.com/meilisearch/meilisearch and https://www.meilisearch.com/docs/learn/self_hosted/enterprise_edition
- Latest release: a third-party review says v1.41.0 on 2026-03-30 (unv). Source: https://toolradar.com/tools/meilisearch
- Hosting:
  - Managed Meilisearch Cloud. Prices disagree across sources, roughly $23-30 per month at entry (unv). Source: https://toolradar.com/tools/meilisearch
  - Self-hosted via Docker or binary, for example on Fly.io. Source: https://meilisearch.com/docs/resources/self_hosting/overview
  - I found nothing on running it on Cloudflare Workers or Containers.
- Covers: typed filters, facets, and a numeric workload filter. A range overlap can be encoded as two numeric fields (`wl_min`, `wl_max`) with `wl_min <= 60 AND wl_max >= 40`. This is my inference from standard filter syntax, **unverified** against the Meilisearch docs.
- We still own:
  - the sync job from the D1 read model to the index (including deletes, so retractions are reflected);
  - the mapping of fact state to filterable attributes (a state filter has to be a flat field);
  - the provenance link back to the source of truth;
  - the query-algebra translation layer.
- It does not cover provenance, bitemporality, rules or the change feed. The index is a projection only.
- Owned maintenance: **Low** (a sync job plus a mapping). Conflict: Cloud copies NAV content to a third party, which is blocked for public use. Prefer self-hosted and private.

**A2. Typesense (Cloud or self-hosted). Coverage about 15%.**
- Same role as Meilisearch. Server licence is GPL-3.0; the client libraries are Apache. Source: https://github.com/typesense/typesense
- Faceting is declared with `"facet": true` in the collection schema, and filters use `filter_by`. Numeric range syntax is `field:[min..max]`. Source: https://typesense.org/docs/guide/tips-for-filtering.html
- The InstantSearch adapter and a demo app exist. Sources: https://github.com/typesense/typesense-instantsearch-adapter and https://github.com/typesense/typesense-instantsearch-demo
- Typesense Cloud is billed per provisioned cluster. Figures vary by source (unv). Source: https://api-pricing.pages.dev/vendor/typesense/
- One vendor-authored comparison says Typesense keeps indexes in RAM (unv, competitor-written). Source: https://kubecon.meilisearch.com/blog/typesense-pricing
- Whether array fields support range overlap is **unverified**; my search did not answer it.
- Owned maintenance: **Low**, the same as A1. GPL-3.0 only matters if we distribute the server.

**A3. XTDB v2 (self-hosted). Coverage about 50-60%. The parallel spike already covers it; included for comparison only.**
- "Open-source immutable SQL database with comprehensive time-travel". Licence MPL-2.0. About 3.1k stars. Speaks SQL and XTQL, with the SQL dialect available over the Postgres wire protocol. Source: https://github.com/xtdb/xtdb
- Bitemporal queries follow SQL:2011. Storage is built on Apache Arrow and object storage. Source: https://www.xtdb.com/v2 (via snippet) and https://xtdb.com/blog/2x-early-access
- Release status: the 2.1.0 line was released around 2025-12-01 per a SourceForge mirror (unv). The 2.1.0-rc0 notes mention OIDC, OpenTelemetry and disk spilling, and say the deprecated HTTP server was removed. Sources: https://github.com/xtdb/xtdb/releases/tag/v2.1.0-rc0 and https://sourceforge.net/projects/xtdb.mirror/files/v2.1.0/
- Hosting:
  - I found no managed XTDB service. JUXT sells support and consulting only. Sources: https://www.xtdb.com/support and https://xtdb.com/support/consulting
  - The repository has `aws`, `azure` and `google-cloud` folders; their content is **unverified**.
  - It is a JVM service that cannot run on Workers. It would sit beside Cloudflare, reached over the Postgres wire protocol (Hyperdrive suitability is **unverified**).
- Covers: immutable facts, valid and recorded time, time-travel and temporal joins. This is the closest match to the philosophy.
- We still own: JVM and object-store ops, the rules and derivation layer, the sameAs closure, fact states, the change feed with retractions (the feed shape is unverified in XTDB), and the query algebra.
- Owned maintenance: **High** (service ops plus all the logic).

**A4. Datomic Pro / Datomic Local. Coverage about 35%. Also covered by the spike.**
- Datomic is free of licence fees. Pro is Apache 2.0 and on Maven Central. Source: https://building.nubank.com/datomic-is-available-free-of-licensing-fees/
- Datomic Local was released in August 2023 under Apache 2.0. Source: https://blog.datomic.com/2023/08/datomic-local-is-released.html
- Datomic Cloud is AWS-only. Non-AWS deployments use Pro. Source: https://docs.datomic.com/on-prem/moving-to-cloud.html
- Pro can use Postgres storage. Source: https://docs.datomic.com/on-prem/storage.html
- Immutable facts with transaction time and Datalog. Valid time is not native; it must be modelled as ordinary attributes (my reading of the Datomic model, **unverified** in this session). Datalog rules are native, which suits `sameAs`.
- Owned maintenance: **High** (transactor and storage ops, plus all logic).

**A5. dlt (dltHub) for source adapters. Coverage about 10% (adapters only).**
- A Python library with a declarative REST API source: pagination, auth and endpoints in config. Source: https://dlthub.com/blog/rest-api-source-client
- The licence is **unverified**. It is probably Apache-2.0 but I did not confirm it. dltHub also has a separate source-available commercial tier. Source: https://dlthub.com/docs/devel/intro
- A SQLite destination was only "being worked on" in 2024 (unv). Source: https://dlthub.substack.com/p/dlthub-august-24-towards-version
- Python only. It cannot run on Workers, so it needs a separate runner.
- It gives pagination, retries and schema evolution for free. It does not do provenance, immutability or ETag-based incremental feeds.
- Owned maintenance: **Medium**. It adds a Python runtime to a TypeScript stack to save an adapter we would write in Effect anyway. The NAV feed is a simple page-and-ETag poller, so net savings are doubtful. This is the weakest case in the top 5.

### Track B: web app templates and UIs

**B1. Datasette. Coverage about 40% of the UI and API needs. Best single adopt.**
- Provides:
  - an interactive website and API over any SQLite database; https://github.com/simonw/datasette
  - JSON API filters (`column__gt`, `__gte`, `__lt`, `__lte`, exact), `_sort`, and `_extra`; https://docs.datasette.io/en/latest/json_api.html
  - facets in both HTML and `.json` views; https://docs.datasette.io/en/0.64/facets.html
  - saved queries via plugins such as `datasette-saved-queries`; https://pypi.org/project/datasette-saved-queries (version disagreement between sources)
  - a plugin catalogue at https://datasette.io/plugins
- Licence Apache-2.0, about 11.5k stars. Source: https://github.com/simonw/datasette
- Latest release: 1.0a41 on 2026-09-24, with an OpenTelemetry addition. 1.0a40 on 2026-09-16 was a security fix. Source: https://simonwillison.net/2026/Sep/24/datasette/ (via snippet).
  - There is no stable 1.0 yet, and no announced date for it. A different search showed a36 as the newest it could see, so I treat a41 as likely but unconfirmed. Source: https://simonwillison.net/2026/Jul/7/datasette/
  - The alpha series carries API-shape risk. The docs say 1.0 is meant to stabilise plugin hooks. Source: https://git.tdem.in/simonw/datasette/discussions/933
- Hosting:
  - `datasette publish` supports Heroku and Cloud Run; https://github.com/simonw/datasette
  - `datasette-publish-fly` deploys a read-only database; https://datasette.io/plugins/datasette-publish-fly
  - Docker works anywhere. Cloudflare Containers reached GA around May 2026 per third-party sources (unv); https://www.cloudmagazin.com/en/2026/05/10/cloudflare-containers-outgrowing-workers/. Nobody I found documents Datasette on it, and a container has no persistent disk, so the database would be baked into the image per deploy.
  - Datasette Cloud exists but I found no pricing.
- D1 and libSQL fit:
  - There is **no official D1 or Turso/libSQL plugin** that I could find. Searches returned nothing.
  - Datasette needs a SQLite file. The practical route is to export D1 via the HTTP export endpoint (a SQL dump, signed URL valid one hour; https://developers.cloudflare.com/api/typescript/resources/d1), load it into a local SQLite file, and serve it read-only. That is a snapshot pipeline we would own, and data lags by the export cadence.
  - `datasette-ts` (scttcper) is a TypeScript port that deploys to Workers plus D1. It describes itself as "datasette but worse", has 1 star, no releases, and no plugins, facets or JSON API documented. Treat it as unusable. Source: https://github.com/scttcper/datasette-ts
- What we would adapt:
  - table and column metadata for fact state;
  - custom templates for provenance detail pages (a row page with foreign-key expansion);
  - a read-model schema that is flat and Datasette-friendly (one row per vacancy attribute with state, evidence and method columns).
- Gaps:
  - The API is table-oriented. It is not the owner's explicit query algebra, and it has no change feed with retractions.
  - Workload overlap is expressible as two columns with `__lte` and `__gte`, which is my inference.
  - MCP and RPC are not covered. I did not verify whether a Datasette MCP plugin exists.
- Owned maintenance: **Medium-low**. We own the snapshot export, the container, alpha-version upgrades, the read-model schema and the templates. Python is a new runtime in the stack.

**B2. Meilisearch or Typesense + InstantSearch UI. Coverage about 30% of the UI.**
- react-instantsearch with `@meilisearch/instant-meilisearch` gives facet widgets, ranges and pagination. Sources: https://www.meilisearch.com/integrations/react and https://meilisearch.com/blog/promoted-search-results-with-react-instantsearch
- Meilisearch has an official demos repo, but no job-board demo was listed. Closest is the property-search "Home Booking" demo. Source: https://github.com/meilisearch/demos/blob/main/README.md
- Typesense has an adapter and a demo app, and again no job-board demo. Sources: https://github.com/typesense/typesense-instantsearch-adapter and https://github.com/typesense/typesense-instantsearch-demo
- Licences: the InstantSearch libraries are (unv) open source; I did not confirm them.
- We would adapt: the widgets, a detail page that links to provenance, and the Foldkit-vs-React question. InstantSearch is React or vanilla, so it does not fit Foldkit and would replace it for the browse page.
- Owned maintenance: **Medium** (UI code, the sync, the index schema).
- Pair with A1 or A2. Same data-exposure constraint: a browser-side search key means public exposure, which is blocked for NAV content.

**B3. Evidence.dev. Coverage about 20% (read-only reports, detail pages by template).**
- MIT. Generates a static site from Markdown and SQL. SQLite is a supported source. Sources: https://awesome.ecosyste.ms/projects/github.com%2Fevidence-dev%2Fevidence and https://geo.sig.ai/brands/evidencedev.md
- Latest: `@evidence-dev/evidence@40.1.8` as of a 2026-06-05 snapshot (unv). Source: https://selfhost-hub.pages.dev/en/evidence
- Parameterised pages can render per-vacancy detail with provenance tables. A static build deploys to any static host, which should include Cloudflare Pages, but I did not find that confirmed.
- Gaps: no live JSON API and no saved queries. Faceted browse is limited to what its components offer (unv).
- Owned maintenance: **Medium**. It is a build pipeline that must re-run on data change. The static output embeds NAV content, so it is blocked if published publicly.

**B4. Observable Framework. Coverage about 15%.**
- ISC licence, version 1.13.3 on npm, released roughly a month before late 2026 (unv). Sources: https://npmjs.com/package/%40observablehq%2Fframework and https://awesome.ecosyste.ms/projects/github.com%2Fobservablehq%2Fframework
- Data loaders in any language build static files. Good for dashboards and exploration, not for a transactional browse and detail app.
- Owned maintenance: **Medium**. Same static-data caveat as Evidence.

**B5. Job-board starter templates (UI shell only). Coverage about 10%.**
- Netlify job-board template on TanStack Start and Drizzle. It is closer to a recruiting pipeline than a public board, licence and filters unverified. Source: https://www.netlify.com/templates/job-board.md
- `norbraet/nextjs-job-board` is the only result with an MIT licence. Next.js 15, Drizzle, Tailwind, AI-powered. Source: https://awesome.ecosyste.ms/projects/github.com%2Fnorbraet%2Fnextjs-job-board
- Bordful (craftled/bordful): Next.js and Airtable, with client-side search. Licence not found. Source: https://awesome.ecosyste.ms/projects/github.com%2Fcraftled%2Fbordful
- I found no Astro job-board template.
- They assume their own data model. Adapting means replacing most of the data layer, so the saving is mostly styling and layout.
- Owned maintenance: **Medium-high**, because we inherit a framework and a stack we do not otherwise use.

### Reference-only (fork candidates for ideas, not for adoption)

- `elliottdehn/open-jobs`: its crawler is a Cloudflare Worker with one Durable Object per job board, daily fetch, diff against the previous day, and embeddings. It is the closest architecture to ours. Licence and maturity are **unverified**. Source: https://github.com/elliottdehn/open-jobs/wiki
- `Digidai/openjobs`: aggregator across 422+ companies, GitHub Actions every 6 hours, schema.org structured data, runs on GitHub Pages and Cloudflare free tier. Licence unverified. Source: https://gh.r-mj.com/Digidai/openjobs
- "Openings" MCP server: crawls Greenhouse, Lever, Ashby, Workday and schema.org JobPosting markup. It reports to a shared aggregator by default, which is a data-flow risk. Source: https://glama.ai/mcp/servers/zs7d7islew
- Neither the Norwegian market nor provenance and bitemporal modelling shows up in any of these.

---

## 2. Most promising adopt combination

**Datasette as the internal explorer and detail-page surface, over a periodic SQLite snapshot of the D1 read model. Keep the Effect core, D1 and Durable Objects unchanged. Add Meilisearch only if faceted full-text search proves necessary.**

What it replaces:
- the hand-built browse, table and facet views in Foldkit, for internal use
- the generic REST read endpoints (replaced by Datasette's JSON API, `_extra` and filters)
- ad hoc saved queries (replaced by canned queries or a saved-queries plugin)

What it does not replace:
- D1 as the system of record, and the Durable Objects
- the rules engine, the fact states and the `sameAs` closure
- the typed query algebra and the MCP, RPC and CLI clients
- the change feed with retractions

Why this ranks first: it is the only candidate that removes a whole UI plus an API surface without adding a stateful service. The snapshot is read-only, so a bug cannot corrupt facts.

Costs and risks, stated plainly:
- A snapshot exporter (D1 HTTP export, then SQLite load) that we own. Data lags by the cadence.
- A Python container with no official Cloudflare or D1 integration. Hosting it near Cloudflare means Containers (GA claimed by third parties, unverified for this use) or a separate Fly/Cloud Run service. Keep it private or behind Cloudflare Access, because public hosting of NAV content is blocked.
- Datasette is still in the 1.0 alpha series, so API and plugin changes are possible. Pin versions.
- Datasette does not enforce the owner's query algebra. If the algebra is the one contract, Datasette must remain an operator tool, not a client-facing API.

Fallback if the Datasette snapshot is rejected: keep the current Foldkit UI and adopt nothing in Track B. The remaining adoptions (search index, dlt) do not remove enough maintenance to justify a second runtime.

On the database question: XTDB v2 and Datomic are the only options that embody the philosophy natively, but both add a stateful JVM service with no managed option found. That is the opposite of the owner's "adopt" rule unless the spike shows the rules and feed logic collapses into queries.

---

## 3. Rejected candidates

| Candidate | Reason | Source |
|---|---|---|
| datasette-ts | Self-described "datasette but worse", 1 star, no releases, no plugins, no facets or JSON API documented | https://github.com/scttcper/datasette-ts |
| Feldera (IVM) | MIT, self-host Docker only; no managed cloud found; streaming-oriented (Kafka, CDC); heavy for a small corpus | https://github.com/feldera/feldera |
| Materialize | Self-managed Community Edition is BSL with a licence key and a 24 GiB memory cap; enterprise priced by sales | https://materialize.com/docs/license/ |
| RisingWave | Apache 2.0 but streaming-database scale and ops; free-tier terms unverified; latest release v3.0.1 on 2026-06-30 is a single third-party claim | https://risingwave.com/open-source-streaming-database/ |
| TerminusDB | Apache-2.0, v12.0.8 on 2026-10-12 per Wikipedia, but a document graph with git-like history, not bitemporal; no Cloudflare fit | https://en.wikipedia.org/wiki/TerminusDB |
| Dolt / Doltgres | Apache-2.0 and DoltHub-hosted, but branch and commit versioning, not valid and recorded time per fact; separate service | https://dolthub.com/blog/2026-08-06-doltgres-1-0/ |
| DoltLite | SQLite fork with Git-like versioning, Beta; the author called the code "entirely vibe code"; not D1-compatible | https://www.dolthub.com/blog/2026-08-31-doltlite-beta |
| Datomic Cloud | AWS-only | https://docs.datomic.com/on-prem/moving-to-cloud.html |
| Airbyte | Platform is Elastic License 2.0; heavy platform to run for two or three sources; connectors are MIT | https://airbyte.com/license-faq |
| Singer taps | Not researched in depth; no Norwegian job-source taps found in my searches (unv) | none |
| Turso Database (Rust rewrite) | Beta and not production-ready per third-party sources; libSQL is the production fork but does not add temporal features | https://blog.openreplay.com/turso-rust-sqlite-evolution/ |
| Orama | Apache 2.0 and runs on Workers, but an in-memory index per isolate means we own index build, sync and persistence | https://github.com/mariocampacci/orama (mirror) |
| Cloudflare R2 SQL / Pipelines | Open beta; Pipelines supports only stateless transforms initially; meant for event data, not entity facts | https://blog.cloudflare.com/cloudflare-data-platform |
| Open-source aggregators (openjobs, open-jobs) | Unknown licences; not provenance-aware; fork would mean owning their crawlers | see section 1 |
| Job-board templates (Netlify, Bordful, nextjs-job-board) | Assume their own data model; unfamiliar frameworks; licences mostly unverified | see B5 |

---

## 4. Unverified list

1. Latest release dates for Meilisearch (v1.41.0, 2026-03-30), Typesense, Feldera, Materialize, RisingWave (v3.0.1), dlt, Airbyte (v2.0.0 on 2025-10-15), Evidence (40.1.8) and Observable Framework (1.13.3). All come from third-party snapshots. GitHub release pages and the API were unreachable.
2. Datasette's newest release being 1.0a41 (2026-09-24). Another search saw only a36.
3. Whether any Datasette plugin integrates with D1, Turso or libSQL. My searches found none. Absence of evidence only.
4. Whether a Datasette MCP plugin exists.
5. Whether Cloudflare Containers can host Datasette with a baked-in SQLite file, and its real cost. Third-party pricing only.
6. NAV terms of use: whether they allow redistribution, and whether CC BY 4.0 on data.norge.no applies to the feed content. The NAV docs page was not fetchable.
7. Teamtailor's official feed endpoints (`/jobs.rss`, `/jobs.json`). Only third-party scraper pages cite them.
8. Existence of any managed XTDB service. None found, but absence is not proof. Also the contents of the `aws`, `azure` and `google-cloud` folders in the XTDB repo.
9. Whether XTDB's Postgres wire endpoint works through Cloudflare Hyperdrive.
10. Datomic's lack of native valid time, and Datomic Local's suitability for production.
11. dlt: licence, 2026 release, SQLite destination status.
12. Typesense: array-range overlap semantics and range faceting. Meilisearch: overlap expressed via two numeric fields (my inference).
13. Meilisearch Cloud and Typesense Cloud prices. Sources conflict.
14. Licences of `elliottdehn/open-jobs`, `Digidai/openjobs`, Bordful and the Netlify job-board template.
15. Whether D1 supports FTS5 and which JSON functions. The Cloudflare limits page did not say.
16. Evidence's deployment on Cloudflare Pages, and its faceting features.
17. All coverage percentages and maintenance ratings are the researcher's estimates.
