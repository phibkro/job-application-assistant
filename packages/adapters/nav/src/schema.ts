import * as Schema from "effect/Schema";

/**
 * The shapes NAV actually serves.
 *
 * Every optional field below is `optional(NullOr(...))` rather than plain
 * `optional`: the recorded live payload sends explicit JSON `null` for
 * `workLocations[].city`/`address`/`postalCode` where an earlier capture
 * simply omitted the key. Modeling only the missing-key case would make this
 * schema accept one shape of "not provided" and reject the other.
 */

const nullishString = Schema.optional(Schema.NullOr(Schema.String));

/** One place a vacancy is worked from. Only `city`/`municipal`/`county` feed
 * the displayed location — `address`/`postalCode`/`country` are decoded so a
 * present-but-unused value never fails the schema, matching the identity
 * derivation this must stay byte-identical with. */
export const WorkLocation = Schema.Struct({
  country: nullishString,
  address: nullishString,
  city: nullishString,
  postalCode: nullishString,
  county: nullishString,
  municipal: nullishString,
});
export type WorkLocation = typeof WorkLocation.Type;

export const Employer = Schema.Struct({
  name: nullishString,
});
export type Employer = typeof Employer.Type;

/** The advert. Nested under `ad_content` in the live envelope — see `Detail`. */
export const AdContent = Schema.Struct({
  published: nullishString,
  expires: nullishString,
  updated: nullishString,
  workLocations: Schema.optional(Schema.Array(WorkLocation)),
  title: nullishString,
  description: nullishString,
  sourceurl: nullishString,
  applicationUrl: nullishString,
  applicationDue: nullishString,
  jobtitle: nullishString,
  link: nullishString,
  employer: Schema.optional(Employer),
});
export type AdContent = typeof AdContent.Type;

/**
 * The live detail envelope: `{ uuid, status, sistEndret, ad_content }`.
 *
 * This is the exact shape that hid a defect for a whole release: an earlier
 * implementation unwrapped `ad_content` first and looked for `uuid`/`status`
 * inside it, so it parsed the advert as the envelope and every live fetch
 * silently fell back to summary data while the run still reported success.
 * `ad_content` is required here for the same reason `required()` is required
 * everywhere else in this schema — a payload shaped like the advert alone,
 * with no envelope, must fail to decode rather than partially match.
 */
export const Detail = Schema.Struct({
  uuid: Schema.String,
  status: Schema.String,
  sistEndret: nullishString,
  ad_content: AdContent,
});
export type Detail = typeof Detail.Type;

/** One entry in the NAV JSON Feed page, with its NAV-specific extension. */
export const FeedEntry = Schema.Struct({
  uuid: Schema.String,
  status: Schema.String,
  title: nullishString,
  businessName: nullishString,
  municipal: nullishString,
  sistEndret: nullishString,
});
export type FeedEntry = typeof FeedEntry.Type;

// Decoded as `feedEntry`, not the wire name `_feed_entry`: a leading
// underscore reads as "private" by convention everywhere else in this
// codebase, and this is a public field of a public shape. `encodeKeys` keeps
// the rename local to this one boundary instead of leaking the wire spelling
// into every call site.
export const FeedItem = Schema.Struct({
  id: nullishString,
  url: nullishString,
  title: nullishString,
  content_text: nullishString,
  date_modified: nullishString,
  feedEntry: FeedEntry,
}).pipe(Schema.encodeKeys({ feedEntry: "_feed_entry" }));
export type FeedItem = typeof FeedItem.Type;

export const FeedPage = Schema.Struct({
  feed_url: nullishString,
  next_url: nullishString,
  items: Schema.Array(FeedItem),
});
export type FeedPage = typeof FeedPage.Type;
