import * as Effect from "effect/Effect";
import { pipe } from "effect/Function";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as S from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";
import { Route as RouteKit } from "foldkit";

/**
 * The URL-shaped mirror of `Model.page` (see `Model.ts`'s `Page` union).
 *
 * Kept as its own type rather than reusing `Page` directly: `Page`'s
 * `Browse` variant carries no fields — the browse filters are
 * `Model.browseQuery`'s job, the one place that state lives — but the
 * URL's `Browse` entry has to carry them in its query string, so the two
 * shapes genuinely differ for the one variant that has a query string at
 * all. `update.ts`'s `UrlChanged` handler is the one place a parsed
 * `Route` is reconciled into `Page` + `browseQuery`; `href` below is the
 * one place the reverse direction happens. Neither Model.ts nor Route.ts
 * imports the other's Message — this module has no `Model`/`update` of
 * its own to close a cycle with.
 */

/** A query parameter that is absent decodes to `""`, exactly like an
 *  untouched filter box, and one holding `""` is left out of the built
 *  query string rather than round-tripping as a literal `?term=` — so an
 *  unfiltered Browse builds a bare `/`, not `/?term=&location=&status=`. */
const omittableString = (defaultValue: string) =>
  S.optionalKey(S.String).pipe(
    S.decodeTo(S.String, {
      decode: SchemaGetter.withDefault(Effect.succeed(defaultValue)),
      encode: SchemaGetter.transformOptional((maybeValue) =>
        Option.filter(maybeValue, (value) => value !== defaultValue),
      ),
    }),
  );

const browseQuery = S.Struct({
  term: omittableString(""),
  location: omittableString(""),
  status: omittableString(""),
});

export const RouteBrowse = RouteKit.r("Browse", {
  term: S.String,
  location: S.String,
  status: S.String,
});
export const RouteJobDetail = RouteKit.r("JobDetail", { jobId: S.String });
export const RouteFeed = RouteKit.r("Feed", {});
export const RouteProfile = RouteKit.r("Profile", {});
export const RouteSaved = RouteKit.r("Saved", {});
/** What an unmatched path parses to — the counterpart to `Model.ts`'s
 *  `PageNotFound`, reached when a link is stale, mistyped, or points at a
 *  route this build no longer serves. */
export const RouteNotFound = RouteKit.r("NotFound", { path: S.String });

export const Route = S.Union([
  RouteBrowse,
  RouteJobDetail,
  RouteFeed,
  RouteProfile,
  RouteSaved,
  RouteNotFound,
]);
export type Route = typeof Route.Type;

const browseRouter = pipe(RouteKit.root, RouteKit.query(browseQuery), RouteKit.mapTo(RouteBrowse));
const jobDetailRouter = pipe(
  RouteKit.literal("jobs"),
  RouteKit.slash(RouteKit.string("jobId")),
  RouteKit.mapTo(RouteJobDetail),
);
const feedRouter = pipe(RouteKit.literal("feed"), RouteKit.mapTo(RouteFeed));
const profileRouter = pipe(RouteKit.literal("profile"), RouteKit.mapTo(RouteProfile));
const savedRouter = pipe(RouteKit.literal("saved"), RouteKit.mapTo(RouteSaved));

const router = RouteKit.oneOf(
  browseRouter,
  jobDetailRouter,
  feedRouter,
  profileRouter,
  savedRouter,
);

/** Parses a URL into a `Route`, falling back to `RouteNotFound` rather than
 *  failing — there is always a screen to show, even for a stale link. */
export const parse = RouteKit.parseUrlWithFallback(router, RouteNotFound);

/** Builds the address bar's representation of a `Route`. The inverse of
 *  `parse` for every route `parse` can actually produce (never called with
 *  a `NotFound` the app itself navigated to, since nothing here builds
 *  one). */
export const href = (route: Route): string =>
  Match.value(route).pipe(
    Match.withReturnType<string>(),
    Match.tagsExhaustive({
      Browse: (value) => browseRouter.build(value),
      JobDetail: (value) => jobDetailRouter.build(value),
      Feed: () => feedRouter.build(),
      Profile: () => profileRouter.build(),
      Saved: () => savedRouter.build(),
      NotFound: ({ path }) => path,
    }),
  );
