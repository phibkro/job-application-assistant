# Norway and Oslo platform index

The original research identified 109 active listing surfaces across 17 categories and 22 merged, historical, or uncertain names.

The source workbook is stored at:

- [`research/input/platform-index.csv`](../../../research/input/platform-index.csv) — the active index
- [`research/input/platform-legacy.csv`](../../../research/input/platform-legacy.csv) — platforms superseded, and what replaced them
- [`research/input/search-stack.csv`](../../../research/input/search-stack.csv)

These were one `.xlsx` until 2026-08-07. The tier and automation-policy columns
decide which platforms this service may collect from and submit to, which makes
them a policy record: a change to one has to be reviewable, and a binary diffs
as "binary files differ".

## Integration principle

Presence in the index does not imply that a connector should be built. Each source should be scored by:

```text
unique relevant listings × freshness × reliability
────────────────────────────────────────────────────
fetch cost × maintenance cost × legal/access risk
```

## Initial source strategy

- Use the NAV vacancy feed as the live source.
- Use a recorded second-source fixture containing known overlap.
- Add a second live source only after the canonical identity model and source-value metrics work.

## Source classes

1. Official API or feed.
2. Authorised structured export.
3. Permitted static HTML retrieval.
4. Permitted browser-rendered retrieval.
5. Search-only or link-out integration.
6. Unsupported because access terms or technical stability are insufficient.
