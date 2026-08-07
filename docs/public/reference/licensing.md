# Licensing

Job Index is proprietary. The complete notice is in the repository root
[LICENSE](../../../LICENSE).

## Project metadata

- SPDX identifier: `LicenseRef-Proprietary`
- Copyright notice: Copyright (c) 2026 Philip B. Krogh. All rights reserved.
- Warranty: none

No licence to use, copy, modify, or distribute this software is granted by
possession of the source. Use requires a separate written agreement.

## Why not an open licence

The service is intended to be sold. An open licence would let a competitor run
the same service; the AGPL this project previously used would have obliged them
to publish their modifications but not stopped them from competing. Source-
available licences that do stop it — FSL, BUSL, Elastic — were considered and
declined in favour of keeping the repository private.

## Packages licensed separately

A package with its own `LICENSE` file is under those terms and not the notice
above:

| Package | Licence | Why |
| --- | --- | --- |
| `packages/better-auth-effect-adapter` | MIT | Written to be published and adopted by others; MIT is what makes that realistic |

A separately licensed package must not incorporate code from the proprietary
tree. That is enforced structurally rather than by review: the adapter imports
nothing from `apps/` or `packages/domain/`.

## Third-party dependencies

Dependencies keep their own licences. As of the last audit the tree is MIT,
BSD-3-Clause, ISC, MPL-2.0, Apache-2.0, and CC-BY-4.0, with no strong copyleft.
MPL-2.0 is file-level copyleft: using those packages is unrestricted, but
modifying their files would oblige publishing those files.

## Network deployments

Nothing about a network deployment triggers a source-offer obligation now. The
production gate no longer requires `JOB_INDEX_SOURCE_CODE_URL`; it is passed
through if set, for deployments that want to link an internal repository.
