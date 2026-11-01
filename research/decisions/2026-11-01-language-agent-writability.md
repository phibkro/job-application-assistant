# Language choice for the Norwegian job-market index (research, 2026-11-01)

Method: about 35 web searches, no repo changes, nothing installed. Snippets came from search results; I did not read primary pages in full. `developers.cloudflare.com` was unreachable from this session (DNS blocked), so Cloudflare's current language docs were not checked. Items marked **unverified** are listed again at the end.

## 1. Scored matrix (1-5, higher is better)

Scores are my judgement from the cited evidence. They are not measurements. Weights are equal; the totals are only a tiebreaker.

| Criterion | TS + Effect v4 | Clojure (+XTDB/Datomic) | Scala 3 (ZIO/CE, Tapir) | Kotlin (Arrow, Ktor) |
|---|---|---|---|---|
| A1 Feedback loop (type checker, compile speed, REPL) | **5** | 4 | 3 | 4 |
| A2 Agent tooling (MCP, LSP, skills, llms.txt) | 4 | 4 | 4 | 3 |
| A3 Public-code prevalence | 4 | 2 | 2 | 3 |
| A4 API stability | 3 | 5 (unverified) | 4 | 4 |
| B1 Typed effects/errors, schema, property tests | **5** | 2 | **5** | 3 |
| B2 Datalog/rules and bitemporal DB clients | 2 | **5** | 3 | 2 |
| C1 Runs on Cloudflare Workers | **5** | 3 | 2 | 2 |
| C2 Ecosystem/ops stability | 3 | 4 | 4 | 4 |
| C3 Shared-language frontend | **5** | 4 | 3 | 3 |
| **Total (of 45)** | **36** | **33** | **30** | **28** |

### Evidence behind each score

**A1 Feedback loop**
- TS: TypeScript 7.0 is a native Go compiler that keeps full type-checking. Microsoft reports 8-12x faster full builds (VS Code 125.7s to 10.6s). It has no stable programmatic API until 7.1, and Vue/Svelte/Astro tooling stays on TS6. Most figures are Microsoft's own. https://infoq.com/news/2026/08/typescript-7-released/ and https://linuxiac.com/typescript-7-0-rewrites-the-compiler-in-go-for-up-to-12x-faster-builds/
- TS+Effect: `@effect/language-service` reports Effect-specific problems that still type-check (floating, never-yielded effects; missing context). Its `includeSuggestionsInTsc` option is described as steering LLM output. `@effect/tsgo` (Effect v4 first, also v3) has a non-interactive setup mode for LLMs. https://github.com/Effect-TS/language-service and https://dev.to/romanonthego/the-best-agent-prompt-is-a-lint-error-3kim
- Clojure: the REPL is the strongest runtime feedback loop. There is no static type check, so errors surface at runtime. Practitioners report paren-balancing friction in agent edits and mitigate it with paren-repair hooks and a live REPL. Anecdotal, no measurement. https://clojurians-log.clojureverse.org/beginners/2026-05-08 and https://clojurians-log.clojureverse.org/core-typed/2025-12-05
- Scala: Scala 3 uses the same incremental compiler as Scala 2. I found no published Scala 3 vs Scala 2 timings. https://scaladays.org/seattle-2023/how-does-incremental-compilation-work-with-scala-3-can-we-improve-it. Heavy implicit and given resolution makes error messages harder for an agent to act on. That is my judgement, **unverified**. Scala.js link time is an extra step with no figures found.
- Kotlin: K2 gave up to 94% faster clean builds on one project. Incremental builds gained 7-35% on Exposed. JetBrains' own numbers from two projects. https://blog.jetbrains.com/kotlin/2024/04/k2-compiler-performance-benchmarks-and-how-to-measure-them-on-your-projects/

**A2 Agent tooling**
- TS+Effect: `effect-smol` ships `LLMS.md` for agents ("only use this documentation and the source code found in ./packages") and `ai-docs/` examples. https://github.com/Effect-TS/effect-smol/blob/main/LLMS.md. The docs site has `llms.txt` and `llms-full.txt`, and a v4 `schema/arbitrary.md` page exists. Community skills warn that agents confuse v3 and v4 (`Effect.catchAll` vs `Effect.catch`). https://agent-skills.md/skills/tenequm/claude-plugins/effect-ts. Effect has a built-in MCP server module (`McpServer`), which helps you build MCP servers, not agent tooling for writing Effect. I found no official Effect MCP server for documentation or agent skills (**unverified** whether one exists).
- Clojure: `bhauman/clojure-mcp` v0.6.0 is now REPL-focused for CLI agents, with tools `clojure_eval`, `list_nrepl_ports` and `paren_repair`. The older README still shows the `:cli-assist` profile, so check the repo. https://github.com/bhauman/clojure-mcp and https://github.com/bhauman/clojure-mcp/releases/tag/v0.6.0. There are many community skills (forj, clojure-repl-dev). Quality is unvetted. https://skills.cat/u/iwillig
- Scala: the official Metals MCP server arrived in Metals v1.5.3, with a standalone `cs install metals-mcp`. It offers compile, test and symbol search to curb hallucinated APIs. https://scalameta.org/metals/docs/features/mcp and https://softwaremill.com/a-beginners-guide-to-using-scala-metals-with-its-model-context-protocol-server/
- Kotlin: JetBrains' official Kotlin LSP is on the Claude plugin marketplace. It needs Java 17+ and is JVM-Gradle-only and experimental. https://claude.com/marketplace/plugins/kotlin-lsp. Koog is an agent framework, not coding-agent tooling. I found no official Kotlin MCP for coding agents.

**A3 Prevalence**
- TypeScript became GitHub's #1 language by monthly contributors in Aug 2025 (2.64M). GitHub ties this partly to typed languages suiting AI-assisted coding. https://github.blog/news-insights/octoverse/octoverse-a-new-developer-joins-github-every-second-as-ai-leads-typescript-to-1/. Effect itself is niche and v4 is recent, hence 4 and not 5.
- The Stack Overflow 2025 table is garbled in extraction (TypeScript 29.2/72.4, Kotlin 9.6/35.4, Scala 2.9/49.1; column meaning unclear). Clojure absent. https://survey.stackoverflow.co/2025/technology/ (**unverified** which column is usage).
- Multi-SWE-bench: agents resolve fewer issues in TypeScript/JavaScript than in Java (possibly confounded by repo size). https://www.alphaxiv.org/benchmarks/peking-university/multi-swe-bench. Language prevalence does not decide agent success by itself.
- Low-resource languages (OCaml, Racket) underperform in MultiPL-E. https://arxiv.org/pdf/2308.09895. Clojure is probably in that regime but I found no Clojure number (**unverified**).
- Scala anecdote: Claude Code with Scala 3 + ZIO 2 "works pretty good". GPT models drift to Scala 2 / ZIO 1 and invent methods. https://reddit.zackpollard.pro/r/scala/comments/1lteb1x/does_anyone_use_llms_with_scala_succesfully (mirror of r/scala, anecdote).
- Kotlin: JetBrains' KotlinHumanEval is at 91% for the best model (early 2025). https://blog.jetbrains.com/kotlin/2025/02/openai-vs-deepseek-which-ai-understands-kotlin-better/

**A4 API stability**
- Effect 4.0 is stable per the official post (dated 2026-10-01 by a third party), with zero-dependency core and 4.x LTS of at least 3 years. https://effect.website/blog/releases/effect/40 and https://zeli.app/story/49925812. `effect/unstable/*` (AI, SQL, workflow, CLI, sockets) may break in minor releases, and modules graduate to the top level. https://www.mintlify.com/Effect-TS/effect-smol/unstable/overview. Beta-to-beta churn was real (effect-aws moved beta.48 to beta.93 and had to adapt to the `Yieldable` removal). https://github.com/floydspace/effect-aws/pull/223. The `Schema.toArbitrary` signature was in flux. https://github.com/Effect-TS/effect/pull/7148/files
- Clojure: stability is a well-known community norm but I did not find a source to cite in these searches (**unverified**). State of Clojure 2025: https://clojure.org/news/2026/02/18/state-of-clojure-2025
- Scala: LTS line 3.3.x, each LTS supported at least 3 years, and backports tested against over 1500 community-build projects. https://scala-lang.org/news/3.3.7. ZIO 2.1.x is binary compatible with 2.0.x. https://www.github.com/zio/zio/releases/tag/v2.1.0. Models drifting to ZIO 1 is a related risk.
- Kotlin: Exposed 1.0 (Jan 2026) promises no breaking changes until the next major. Ktor 3.4's OpenAPI `describe` API is experimental. https://blog.jetbrains.com/kotlin/2026/01/exposed-1-0-is-now-available/. Arrow 2.0 kept source compatibility but broke binary compatibility in places. https://arrow-kt.io/community/blog/2024/12/05/arrow-2-0/

**B1 Typed effects, schema, property tests**
- TS: Effect plus Schema gives typed errors/requirements, and `Schema.toArbitrary` derives fast-check arbitraries from schemas (a schema-to-generator path). https://effect.website/docs/v4/schema/arbitrary
- Clojure: no typed effects. spec/malli plus test.check is the substitute. I did not search these, so this is from general knowledge (**unverified** here).
- Scala: ZIO/Cats Effect are the reference typed-effect implementations, which Effect itself imitates. zio-schema, zio-test and ScalaCheck exist. Not searched in depth. Specific libraries, versions and Scala 3 support are **unverified**.
- Kotlin: Arrow 1.2.0 added `Raise` typed errors and 2.0 refined them (`RaiseAccumulate`). https://xebia.com/blog/a-new-module-for-typed-errors-in-arrow-1-2-0/. Errors are not tracked in function signatures the way ZIO/Effect do, so 3.

**B2 Datalog/rules and bitemporal clients**
- XTDB v2: the Clojure API supports SQL and XTQL. Kotlin/Java use JDBC over the Postgres wire protocol. XTQL was removed from Java/Kotlin, with no plans to support it outside Clojure (Dec 2024 maintainer statement). https://docs.xtdb.com/drivers/clojure, https://docs.xtdb.com/clients/kotlin, https://clojurians-log.clojureverse.org/xtdb/2024-12-03. Treat these as dated; confirm against current XTDB docs.
- Scala/TS: no Scala client found; TS can use pg wire (not searched, **unverified**). I found no embedded Datalog engine in TS or Kotlin; Scala only has a research compiler (Flan). Datomic and DataScript are Clojure-native (general knowledge, **unverified** here). Another researcher covers the databases themselves.

**C1 Cloudflare Workers**
- TS: native. The stack already runs there.
- Clojure: ClojureScript works via shadow-cljs plus Wrangler (blog posts and templates, mostly older). A websocket REPL is not supported inside Workers. Squint/cherry are alternatives, squint "may undergo breaking changes". https://github.com/thheller/cljs-cf-worker, https://dev.to/pilt/clojurescript-on-cloudflare-workers-2d9g, https://github.com/eNotchy/squint. XTDB itself is a JVM server (general knowledge, **unverified** here), so the data layer cannot live on Workers anyway.
- Scala: Scala.js on Workers has been supported since 2020, with a 1MB bundle concern. https://blog.cloudflare.com/cloudflare-workers-announces-broad-language-support. There is a ScalablyTyped-generated Workers facade with no semver or binary compatibility guarantees. https://index.scala-lang.org/indoorvivants/cloudflare-worker-types. I found no D1 facade and no evidence that zio-http or Tapir run on Scala.js/Workers (**unverified**).
- Kotlin: the official Workers template is Kotlin/JS and looks outdated (Wrangler v2 era). Kotlin/Wasm forks are reported flaky. Coroutines added about 25k lines to the JS bundle in one report. https://github.com/cloudflare/kotlin-worker-hello-world and https://slack-chats.kotlinlang.org/t/29821759/i-m-interested-in-doing-a-cloudflare-worker-with-kotlin-pref. Ktor/Exposed/jOOQ are JVM-only in practice, so the proposed Kotlin stack would not run on Workers.
- JVM languages would need Cloudflare Containers or another host. Containers run any language per Cloudflare docs, but I found no JVM-specific support statement or GA status. https://developers.cloudflare.com/containers/index.md (**unverified**).

**C2 Ecosystem/ops stability**
- Evidence is mostly the A4 links. Clojure's survey shows strong loyalty but onboarding difficulty. https://clojure.org/news/2026/02/18/state-of-clojure-2025. Kotlin and Scala are JVM-mature. Effect is new at stable 4.0 and the Effect ecosystem is much younger.

**C3 Frontend**
- TS: one language across worker and browser. Clojure: ClojureScript is mature but a separate dialect from JVM Clojure in places. Scala.js and Kotlin/JS exist but have smaller component ecosystems (my judgement; no source searched).

## 2. Recommendation

**Top: stay on TypeScript + Effect v4 for the application and Worker layer.**
Reasons from the evidence:
- Native on Workers/D1. Every other option adds either a JS-compile target with thin facades or a container host.
- Fastest feedback loop. TS7 is about 10x faster, and the Effect language service turns type-checking-passes-but-wrong mistakes into diagnostics.
- Effect 4.0 is stable with LTS, and the repo ships agent docs (`LLMS.md`).
- The stack gives a typed-effects, schema and property-test path (Schema to fast-check) that matches the stated principles.

Strongest counter-argument: Datalog and bitemporality are first-class principles, and the only mature client for XTDB's XTQL is Clojure. TS has no embedded Datalog, so rules would have to be built (violating adopt > adapt > build) or pushed into SQL. Also, Effect v4 is weeks old, `unstable/*` still churns, and agents mix v3/v4 APIs. That is the same pain you just hit.

**Runner-up: Clojure (with XTDB), conditional on the XTDB spike succeeding.** It is the best fit for B2 and has a strong REPL-driven agent loop (clojure-mcp). It scores 4 on API stability only if you accept the unverified claim above.

Strongest counter-argument: it has no static types and no typed effects. That violates two of your five principles and leaves agents without compile-time feedback. Prevalence in models is probably low (unverified), paren errors are a known agent failure, and the data layer cannot run on Workers.

A hybrid is worth costing: Clojure/XTDB as the fact store and rules service, with TS/Effect at the edge. It doubles toolchains and review burden, so only do it if XTDB wins.

Scala 3 + ZIO scores highest on typed-effects fit but loses on Workers, and its Datalog/bitemporal story is JDBC only. Kotlin scores lowest here: Arrow errors are weaker, and Ktor/Exposed do not run on Workers.

## 3. What the follow-up hands-on spike should measure

Use the same falsifiers (tasks) in each candidate language, with the same agent (Claude Code) and model, and a fixed attempt budget per task.
1. Agent task success rate on 8-10 tasks, pass/fail against the same hidden tests. Include: add a bitemporal fact type, a rule (derived fact), a property-tested law (e.g. merge idempotence/associativity), a typed-error path, and a D1/DB migration. Report the pass rate, number of turns and tokens per task.
2. Compile-feedback latency: cold and warm edit-to-diagnostic time (`tsgo`, Effect language service, Metals MCP compile, Gradle K2, clj-kondo/REPL eval). Take medians over 20 edits.
3. Error actionability: how often the first agent fix after a diagnostic succeeds. Count hallucinated APIs and version-drift errors (Effect v3 vs v4, ZIO 1 vs 2, Scala 2 vs 3).
4. Structural failure rate: Clojure paren errors with and without `paren_repair`.
5. Rework after human review: lines changed in review per accepted task.
6. Deploy path: time and steps to a working Worker plus remote smoke test, bundle size vs the Workers limit, and whether D1 access needs hand-written facades.
7. Churn exposure: pin versions, then count breaking changes when bumping to the latest minor of Effect, ZIO, Arrow and Clojure libs.
8. Rules/bitemporal cost: lines of owned code to answer "as of valid-time T and system-time S" queries in TS vs Clojure/XTDB.

## 4. Unverified list
- Whether the Effect docs site or Effect team publishes an official MCP server or agent skills for writing Effect code (only community skills and `LLMS.md` found).
- Effect 4.0 stable release date (2026-10-01 comes from a third-party summary) and the LTS follow-up policy post. Effect 4.1 module moves were not found, since the searches only turned up beta material.
- Which SO 2025 column is usage vs desire; Clojure's SO numbers.
- Kotlin and Scala numbers in GitHub Octoverse 2025.
- Any Clojure per-language LLM benchmark; Clojure being a low-resource language in model training data.
- Clojure API stability claim (from general knowledge, no source cited).
- Scala 3 vs Scala 2 compile timings, Scala.js link time, Scala error message quality for agents.
- ZIO 2 current version; zio-schema, Tapir and zio-test Scala.js support; any D1 facade for Scala.js.
- Cloudflare's current language docs and whether Cloudflare Containers supports JVM workloads or is GA (docs host blocked).
- Whether the Kotlin/Wasm Workers path works on current Kotlin; Kotlin LSP maturity beyond "experimental".
- Current XTDB client status (sources are from 2024), including Scala/TS access via pg wire.
- Whether any embedded Datalog engine exists for TS or Kotlin (only a search-result absence).
- Whether XTDB v2 can run on or near Workers (it is a JVM server per general knowledge).
- Property-testing library versions for Scala, Kotlin and Clojure.
- Effect v4 `Schema.toArbitrary` final signature (docs and PR #7148 disagree).
