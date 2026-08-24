# WS-0013-r1 — Design-System Port Inventory (apps/web)

Factual inventory for porting the course-data-platform semantic-token design system into `job-index/apps/web`. Target vocabulary read from `course-data-platform/apps/student-web/src/styles.css` (`@theme inline` exposing `--md-sys-color-*` as Tailwind v4 color utilities, plus `--radius-m3-*` / `--shadow-m3-*` aliases).

## Target token vocabulary (from student-web `styles.css:3-48`)

| Tailwind class family | Backing variable | Notes |
|---|---|---|
| `primary`, `on-primary`, `-container`, `on-primary-container` | `--md-sys-color-primary*` | |
| `secondary`, `on-secondary`, `-container`, `on-secondary-container` | `--md-sys-color-secondary*` | |
| `tertiary`, `tertiary-container`, `on-tertiary-container` | `--md-sys-color-tertiary*` | no bare `on-tertiary` exported |
| `error`, `error-container`, `on-error-container` | `--md-sys-color-error*` | |
| `warning`, `warning-container`, `on-warning-container` | `--md-sys-color-warning*` | |
| `valid`, `on-valid` | `--md-sys-color-valid` | success family |
| `danger`, `danger-container`, `on-danger-container` | aliases of error tokens | |
| `surface`, `surface-container(-low/-high/-highest)` | `--md-sys-color-surface*` | |
| `on-surface`, `on-surface-variant` | | muted text = `text-on-surface-variant` |
| `outline`, `outline-variant` | | borders |
| `constraint`, `on-constraint` | aliases of on-surface/surface | |
| `chart-1..5` | `--chart-N` | themeable via `data-chart-color` |
| `rounded-m3-small/medium/large/extra-large` | `--md-sys-shape-corner-*` (0.75–2rem) | |
| `shadow-m3-1`, `shadow-m3-2` | `--md-sys-elevation-level-1/2` | |

Light values live in `:root`; dark mode via `.dark` overrides; base/theme/chart presets via `data-base-color` / `data-theme-color` / `data-chart-color` attributes. No fonts are loaded via `@import` — font-family is declared in `:root` (Inter stack).

## 1. Raw palette audit

**Total raw palette utilities under `apps/web/src`: 172 occurrences across 9 files.** No other palette hues used. Distinct raw utilities:

| Utility | Count | | Utility | Count |
|---|---|---|---|---|
| gray-500 | 43 | | indigo-700 | 5 |
| gray-900 | 26 | | indigo-50 | 5 |
| gray-700 | 20 | | gray-100 | 5 |
| gray-600 | 15 | | gray-300 | 4 |
| gray-200 | 8 | | indigo-900 | 3 |
| indigo-600 | 7 | | indigo-500 | 2 |
| gray-50 | 7 | | indigo-200 | 2 |
| amber-900 | 3 | | amber-800 | 2 |
| amber-50 | 2 | | amber-300 | 2 |
| amber-100 | 1 | | indigo-950 | 1 |
| indigo-800 | 1 | | green-600 | 1 |
| green-700 | 1 | | blue-800 | 1 |
| blue-50 | 1 | | blue-200 | 1 |
| red-800 | 1 | | red-50 | 1 |
| red-200 | 1 | | | |

Per-file counts:

| File | Count | File | Count |
|---|---|---|---|
| `saved/view.ts` | 55 | `profile/view.ts` | 8 |
| `view/Shared.ts` | 47 | `view/Chrome.ts` | 7 |
| `view/JobDetail.ts` | 35 | `main.ts` | 3 |
| `view/Feed.ts` | 9 | `profile/ExperienceEntry.ts` | 2 |
| `view/Browse.ts` | 6 | | |

Usage patterns → proposed semantic tokens:

| Pattern (where seen) | Current classes | Proposed token classes |
|---|---|---|
| Page/app background (main.ts:57) | `bg-gray-50` | `bg-surface` |
| App chrome/header surface (main.ts:60), cards, empty-state boxes, CV/letter `pre` blocks | `bg-white` (+ `border-gray-200`) | `bg-surface` or `bg-surface-container-low` |
| Elevated card (Shared card) | `border-gray-200 bg-white shadow-sm` | `border-outline-variant bg-surface-container-low shadow-m3-1` |
| Headings & strong text (all views) | `text-gray-900` | `text-on-surface` |
| Muted body text (43×) | `text-gray-500` | `text-on-surface-variant` |
| Mid-muted text | `text-gray-600`, `text-gray-700` | `text-on-surface-variant` / `text-on-surface` |
| Dividers between list items | `divide-gray-100` | `divide-outline-variant` |
| Borders on cards/fieldsets/chips | `border-gray-200` / `border-gray-300` | `border-outline-variant` |
| Focus ring / outline (buttons, nav links, checkboxes, links) | `focus-visible:outline-indigo-600` | `focus-visible:outline-primary` |
| Primary button + checked checkbox fill | `bg-indigo-600 hover:bg-indigo-700 text-white` | `bg-primary hover:bg-primary/90 text-on-primary` |
| Nav active state | `bg-indigo-50 text-indigo-700` | `bg-secondary-container text-primary` (or primary-container) |
| Ghost button / text link | `text-indigo-700 hover:bg-indigo-50` | `text-primary hover:bg-primary-container` |
| Upsell/capability callout | `border-indigo-200 bg-indigo-50 text-indigo-900/800/950` | `border-primary-container bg-primary-container text-on-primary-container` |
| Success button | `bg-green-600 hover:bg-green-700 text-white` | `bg-valid hover:bg-valid/90 text-on-valid` |
| Warning button / downgrade notice / "Concerns" | amber-50/300/800/900/100 | `bg-warning-container border-warning-container(→outline)` `text-on-warning-container` |
| Danger/problem card | `border-red-200 bg-red-50 text-red-800` | `bg-danger-container border-outline text-danger text-on-danger-container` |
| Info problem card (sign-in prompt) | `border-blue-200 bg-blue-50 text-blue-800` | `bg-secondary-container text-on-secondary-container` |
| Form controls (inputs/selects/textareas) | `border-gray-300 … disabled:bg-gray-50 disabled:text-gray-500 focus:border-indigo-500 focus:ring-indigo-500` | `border-outline disabled:bg-surface-container disabled:text-on-surface-variant focus:border-primary focus:ring-primary` |
| Field labels | `text-gray-700` | `text-on-surface` |
| Disabled checkbox | `disabled:bg-gray-50 disabled:text-gray-500` | `disabled:bg-surface-container disabled:text-on-surface-variant` |
| Chips ("Current attempt" vs prior) | `bg-indigo-50 text-indigo-700` vs `bg-gray-100 text-gray-600` | `bg-secondary-container text-primary` vs `bg-surface-container-highest text-on-surface-variant` |
| Radius/shadow | `rounded-md/lg`, `shadow-sm` | `rounded-m3-small/medium`, `shadow-m3-1/2` |

## 2. Route surface

Page variants (Model.ts:50-58): `Browse{}`, `JobDetail{jobId}`, `Feed{}`, `Profile{}`, `Saved{}`, `NotFound{path}`.

Nav destinations (Chrome.ts:36-72): Browse → `/` (carries current search filters in query string), Fresh feed → `/feed`, Saved → `/saved`, Profile → `/profile`. Active tab gets `aria-current="page"` and `bg-indigo-50 text-indigo-700`.

View headlines:

| View | Renders |
|---|---|
| view/Browse.ts | `sectionHeading("Browse")`, sr-only-labelled term/location/status search form, results list with divide-y rows, "Load more" secondary button |
| view/Feed.ts | `sectionHeading("Fresh feed")` + tagline, Refresh button; keyed list items with `data-job-title`/`data-fit` and a `matchAssessmentView` per item; empty-state card |
| view/JobDetail.ts | job title h2 card (description, deadline, "Original listing ↗"), match assessment, apply-flow section (shortlist → Prepared/Decided stage cards, Prepare buttons, Approve/Rework/Decline decisions, downgrade notice, external-submission note) |
| view/Shared.ts | shared helpers: `card`, `sectionHeading`, buttons (primary/secondary/success/warning/ghost), form fields via @foldkit/ui headless components, `matchAssessmentView`, `renderProblem`, `notFoundView` |
| profile/view.ts | `sectionHeading("Profile")`; anonymous prompt, else profile form (headline, summary textarea, desired roles/locations/excluded terms textareas, experience submodel list + "Add experience", capabilities line, Save) |
| saved/view.ts | `sectionHeading("Saved")` + tagline + Refresh; filter presets/labels/sort fieldset, custom-label manager (create/rename/delete), saved-vacancy list with per-item application-history region and status chips |

## 3. Framework usage

`apps/web/package.json` pins: `foldkit 0.139.0`, `@foldkit/ui 0.139.0`, `tailwindcss 4.3.3` + `@tailwindcss/vite 4.3.3` (dev), `vite 8.2.1` (dev); also `clsx 2.1.1` and workspace `@job-index/domain`.

`@foldkit/ui` facilities imported today:
- Shared.ts:3 — `Button, Checkbox, Input, Select, Textarea`
- profile/ExperienceEntry.ts:8 — `Fieldset`

These are used **headlessly**: apps/web calls `<Comp>.view({ toView })` and applies its own `h.Class(...)` strings to the emitted attribute bundles (e.g. `attributes.input`, `attributes.label`, `attributes.checkbox`).

Inline styles / hex colors / svg fills: **none found**. No `style=` attributes, no `h.Style`, no hardcoded `#rrggbb` anywhere under `apps/web/src`; no svg usage at all. All color is via Tailwind utility classes in class strings.

## 4. Test touchpoints

Unit tests (`*.test.ts` under `apps/web/src`) assert only models/messages/commands/routes — zero `className` or class-string assertions (grep for class patterns in tests returned nothing). A palette→token migration cannot break them.

E2E: `e2e/shortlist.spec.ts` (Playwright, chromium-only per e2e/playwright.config.ts, BASE_URL default http://127.0.0.1:8799):
- Uses `@axe-core/playwright` (`AxeBuilder.analyze()`, expects zero violations) scanned 4 times over: post-profile-save Profile page, Fresh feed list, JobDetail page. Class-name changes don't affect it directly, but any contrast regression from new token pairings will fail these axe assertions.
- Selectors are role/text/label-based plus stable data hooks (`data-job-title`, `data-fit`, `[data-match-assessment]`) — none reference palette class names, so nothing breaks mechanically from renaming classes.

## 5. Entry / HTML shell

- `index.html`: loads `/src/styles.css` stylesheet and `./src/entry.ts` module script into `<div id="root">`. No font links, no `<meta name="theme-color">`, no `color-scheme` declaration.
- `src/entry.ts`: `Runtime.makeApplication({ Model, init, update, view, routing, container: document.getElementById("root") })` then `Runtime.run`.
- `src/styles.css` is just `@import "tailwindcss";` — the port would add the `@theme inline` + `:root` token block here.
- Storage: **no `localStorage` anywhere**. `sessionStorage` is used deliberately for the session token (`Session.ts`, read once in `init`, written by session Commands; Chrome.ts comment states the token never touches localStorage). A dark-mode preference would need a new storage decision.

## Risks

- The target system's success color is `valid/on-valid` while danger maps onto `error` containers; apps/web currently uses green-600/700 for Approve and reserves red strictly for problems — a careless mapping could make Approve look like an error tone or lose the deliberate red-only-means-failure convention.
- Amber warning usages span two different intents (Rework decision button vs downgrade/concerns notices); one flat `warning-container` mapping may collapse a distinction the UI comments explicitly defend.
- All 172 palette utilities sit inside string literals built with `clsx`/concatenation; a regex codemod must not touch prose/comments that mention colors (e.g. JobDetail.ts:176 "cautionary amber") or it corrupts copy.
- Contrast regressions are silent until e2e: axe runs only in `e2e/shortlist.spec.ts` against three pages; token pairs like `text-on-surface-variant` on `bg-surface-container-high` need contrast checks before the suite runs.
- Dark mode arrives with `.dark` overrides and possibly `color-scheme`; index.html has neither, and session storage precedent rules out silently persisting a theme choice in localStorage without a product decision.
