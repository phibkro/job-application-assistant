# Current HTTP API

`apps/worker/src/Api.ts` is the authoritative contract. It defines request,
response, and typed-error schemas for the TypeScript/Effect Worker. This page
is a route map for operators and client authors.

The [API v1 page](api-v1.md) is historical. It documents routes from the
retired Rust worker that are not present in the current service.

## Authentication

Account routes require this header:

```http
Authorization: Bearer <session-token-or-api-key>
```

The middleware returns `401 Unauthorized` for a missing, expired, revoked, or
unknown credential. It returns the same error when the credential has no
active profile.

## Operational routes

| Method | Path | Result |
| --- | --- | --- |
| `GET` | `/api/health` | Service status and environment |
| `GET` | `/api/about` | Service name, license, and environment |

These routes do not query D1.

## Public corpus routes

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/jobs` | Search and page canonical vacancies |
| `GET` | `/api/v1/jobs/:id` | Read one canonical vacancy |
| `GET` | `/api/v1/sources/catalog` | Read the researched source catalog |

`GET /api/v1/jobs` accepts `term`, `location`, `status`, `cursor`, and `limit`.
The handler limits a page to 100 rows.

## Account and feed routes

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/me` | Read the profile and capabilities |
| `PUT` | `/api/v1/me/profile` | Replace the reusable profile |
| `PUT` | `/api/v1/me/answers/:question` | Record one reusable answer |
| `GET` | `/api/v1/me/profile/export` | Export profile and application history |
| `PUT` | `/api/v1/me/profile/import` | Import a profile from JSON |
| `GET` | `/api/v1/me/feed` | Read fresh vacancies for the profile |
| `POST` | `/api/v1/me/feed/:id/dismiss` | Record a feed judgment |

## Saved workspace routes

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/me/saved` | Save a hydrated vacancy snapshot |
| `GET` | `/api/v1/me/saved` | List and filter saved vacancies |
| `POST` | `/api/v1/me/saved/:id/draft` | Draft CV and letter text |
| `POST` | `/api/v1/me/saved/:id/apply` | Prepare an assisted or automated attempt |
| `POST` | `/api/v1/me/applications/:id/decision` | Approve, rework, or decline a prepared attempt |
| `POST` | `/api/v1/me/applications/:id/events` | Record a human lifecycle event |
| `GET` | `/api/v1/me/saved/:id/applications` | Read current and prior attempts |

The Saved list accepts these values:

| Parameter | Values |
| --- | --- |
| `view` | `all`, `active`, `needs-action`, `applied`, `closed` |
| `sort` | `recently-saved`, `deadline-soon`, `recently-updated` |
| `label` | An owned custom-label ID |
| `cursor` | The opaque Saved page cursor |

Saving stores a frozen vacancy snapshot. A later corpus change does not change
that snapshot. Preparing an application does not record a submission.
`confirm-submission` is a separate human event.

Application events require `expectedUpdatedAt`. The service rejects a stale
write instead of overwriting a newer state.

## Custom-label routes

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/me/saved/labels` | List owned custom labels |
| `POST` | `/api/v1/me/saved/labels` | Create a custom label |
| `PATCH` | `/api/v1/me/saved/labels/:id` | Rename a custom label |
| `DELETE` | `/api/v1/me/saved/labels/:id` | Delete a label and its assignments |
| `PUT` | `/api/v1/me/saved/:id/labels` | Replace a saved vacancy's label set |

Label names are unique per profile after case and whitespace normalization.
The names `saved`, `closed`, `expired`, and `occupied` are reserved system
labels.

## Typed errors

The API uses tagged JSON errors. Common statuses are:

| Status | Tag | Meaning |
| --- | --- | --- |
| `400` | `InvalidProfileJson`, `ReservedLabelMutation` | The request violates a declared input rule |
| `401` | `Unauthorized` | The credential is not valid for an active profile |
| `402` | `UpgradeRequired` | The account lacks a required capability |
| `403` | `ForbiddenByPlatform` | Platform policy prohibits the action |
| `404` | `NotFound` | The owned resource does not exist |
| `409` | `LabelConflict`, `InvalidApplicationTransition`, `StaleApplicationUpdate` | The request conflicts with current state |

Read the exact fields from the tagged error classes in
`apps/worker/src/Api.ts`.
