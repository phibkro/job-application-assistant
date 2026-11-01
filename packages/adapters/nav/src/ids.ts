import type { PlatformId, SourceId } from "../../../domain/src/Ids.ts";

/**
 * NAV identity constants, in a module with no Effect import so the pure importer (`observe.ts`) can use them
 * (WS-0022 boundary). `decode.ts` re-exports them, so existing imports are unchanged.
 *
 * `Schema.brand` documents that it "adds no runtime check" (it only narrows the type), so a cast is the correct
 * construction for a literal that is branded purely for compile-time discipline.
 */
export const NAV_SOURCE_ID = "nav" as SourceId;
export const NAV_SOURCE_NAME = "Arbeidsplassen (NAV)";

/**
 * The catalogue seed's id for this platform — distinct from `NAV_SOURCE_ID`: NAV's feed calls itself `"nav"` while
 * the catalogue calls it `"arbeidsplassen-nav"`.
 */
export const NAV_PLATFORM_ID = "arbeidsplassen-nav" as PlatformId;

export const navPostingUrl = (uuid: string): string =>
  `https://arbeidsplassen.nav.no/stillinger/stilling/${uuid}`;
