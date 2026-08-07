import type { PlatformId, SourceId } from "./Ids.ts";

/**
 * Identities that adapters, the catalogue, and the corpus must agree on.
 *
 * These were previously discoverable only by reading the Rust crate and the
 * catalogue seed, so the first adapter had to go looking for them and then
 * restate them locally. An identity that two sides must share is a contract,
 * and it belongs where both sides can see it.
 *
 * The casts are the one place a brand is asserted rather than parsed. That is
 * appropriate here and nowhere else: these are literals fixed by the catalogue,
 * not input, and a decode would only be able to fail at startup.
 */

/** The source that owns NAV-observed listings in the corpus. */
export const NAV_SOURCE = "nav" as SourceId;

/** Its row in the researched platform catalogue — a different identifier. */
export const NAV_PLATFORM = "arbeidsplassen-nav" as PlatformId;

/** The delivery platform the learning loop targets first. */
export const WEBCRUITER_PLATFORM = "webcruiter" as PlatformId;
