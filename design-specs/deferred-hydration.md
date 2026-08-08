# Deferred hydration: fetch a vacancy's detail when someone wants it

## The problem, stated plainly

Ingesting one NAV feed page costs 883 HTTP requests: one for the page, and one
detail fetch for each of its ~882 active entries. Cloudflare allows 50
subrequests per invocation on the free plan and 1000 on paid, so a single page
does not fit in a single run. Ingestion currently fails with
`SourceUnavailable (no response)` before completing one page.

The obvious fix is to make the crawl resumable *within* a page, so a run can
process forty details and continue at the forty-first. That is real work, it
touches the invariant this system is most careful about — `closeAbsent` may
only fire on a complete enumeration — and it would leave the underlying
absurdity in place.

The absurdity: of the three fields a detail fetch supplies, **none is used by
anything the corpus does with a vacancy nobody has opened.**

| Field | Comes from | Needed for |
| --- | --- | --- |
| title | feed page | identity, search, browse |
| employer | feed page | identity, search, browse |
| location | feed page | identity, search, browse |
| external id | feed page | occurrence identity, closure |
| **description** | **detail fetch** | drafting, and the detail screen |
| **deadline** | **detail fetch** | the detail screen |
| **application URL** | **detail fetch** | applying |

`deriveCanonicalKey` is title + employer + location. `deriveOccurrenceId` is
source + external id. Search deliberately covers title and employer only —
"description is free source text and would turn search into grep". So the 882
extra requests per page buy nothing for browsing, searching, deduplicating, or
closing. They buy the ability to answer questions nobody has asked yet, about
vacancies nobody has looked at.

## User journey

1. **Ingestion reads a feed page and stops there.** One request. Every active
   entry becomes a canonical job carrying title, employer, location, published
   date, and its source's external id. Its description is empty and it is
   marked unhydrated.
2. **Someone browses or searches.** Both work entirely on what a feed page
   gave us. Nothing about the result list changes.
3. **Someone hovers over a vacancy, or otherwise signals intent.** The
   interface asks the worker to hydrate it. If the person then clicks, the
   detail is usually already there; if they do not, one wasted request against
   a source that publishes a feed for exactly this purpose.
4. **Someone opens a vacancy that is not hydrated yet.** The worker fetches
   the detail, stores it on the canonical row, and answers. Subsequent views
   of that vacancy — by anyone — need no fetch.
5. **Someone saves, drafts, or applies.** Hydration is a precondition, so it
   happens here too if intent-prefetch and the detail view were both skipped.
   Drafting needs the description to rank experience against the advert;
   applying needs somewhere to send the person.

## The interface

Two changes to the corpus, and one to acquisition.

**`CanonicalJob` gains a hydration state.** `description` and `deadline`
become absent-until-hydrated rather than required. The state is explicit — a
job is `Summary` or `Hydrated` — rather than a description that happens to be
the empty string, because "we have not fetched this" and "this advert has no
description" are different facts and only one of them is worth retrying.

**`applicationUrl` stays required**, because NAV's public advert URL is
derivable from the entry's uuid — `https://arbeidsplassen.nav.no/stillinger/
stilling/{uuid}`, verified to answer 200 — so a summary can carry a real link
a person can follow without any detail fetch. An adapter that cannot derive
one must say so, and a vacancy without a way to reach it is a vacancy this
service should not be listing.

**`SourceAdapter` gains `hydrate`.** A separate operation from `page`, taking
one external id and returning the fields a page could not. An adapter whose
feed already carries everything implements it as a no-op returning what it
has; the JSON-LD adapter is likely such a case, since a scraped page has no
second tier of detail to fetch.

**`Corpus` gains hydration.** A read that returns an unhydrated job is not an
error, and `Corpus.hydrate(id)` is idempotent: two concurrent requests for the
same unhydrated vacancy must not both fetch it. The `SourceLease` Durable
Object already solves exactly this shape of problem for ingestion.

## What this guarantees, and what it refuses

**Ingestion fits any plausible limit.** One subrequest per page, so a run's
cost is a function of pages walked rather than of how many vacancies a source
happens to publish. The within-a-page cursor redesign is unnecessary, and the
"move ingestion to a server" question stops being urgent — it remains a
reasonable thing to want, for reasons that are no longer about limits.

**Politeness.** We stop fetching details for vacancies nobody opens, which on
current numbers is nearly all of them. That is worth stating as a property
rather than a side effect: a collector that reads only what it is asked for is
in a materially better position on the question of what it is entitled to
collect.

**It refuses to guess.** An unhydrated job is marked unhydrated, not given a
plausible empty description. `Drafting` and the apply flow require hydration
rather than composing against a blank advert — a letter written against no
description is worse than an error.

## Falsifiers / definition of done

1. Ingesting one NAV feed page makes **one** HTTP request. Asserted by
   counting requests through a fake `HttpClient`, not by inspection.
2. A full page ingests inside a Worker invocation's subrequest budget on the
   free plan. Verified on the deployment, not locally.
3. Browse and search results are unchanged, field for field, between a
   hydrated and unhydrated corpus. This is the claim that the deferred fields
   were genuinely unused; if a result differs, the premise of this spec is
   wrong.
4. Opening an unhydrated vacancy returns a complete one, and a second open
   issues no further fetch.
5. Two concurrent opens of the same unhydrated vacancy fetch its detail once.
6. Drafting or applying against an unhydrated vacancy hydrates first, and
   fails loudly if hydration fails, rather than composing against an empty
   description.
7. A vacancy whose advert closed between the feed page and hydration reports
   that, and does not become an empty hydrated job.

## What is not here yet

Prefetch policy beyond hover. Intent has other signals — scroll position,
keyboard focus, a pointer moving toward a target — and this spec commits only
to the cheapest one. Whether prefetching should be throttled, or skipped on a
metered connection, is a question for whoever measures it.

Backfilling hydration for jobs nobody opens is deliberately absent. It would
reintroduce the cost this removes, and the corpus does not need it.

## Open questions (operator-owned)

- **Should search ever cover descriptions?** It does not today, and this spec
  assumes it never will — searching a field that exists for only some rows
  would return results that depend on who happened to click what. If
  description search is wanted, it needs a different design: hydrate
  everything on a schedule, or a separate index.
- **Is a wasted prefetch acceptable to the source?** Hovering costs NAV a
  request for an advert the person may not open. Cheap and normal by web
  convention; worth a decision before applying the same pattern to a platform
  whose terms are less permissive than a public feed's.
