import * as Option from "effect/Option";
import * as S from "effect/Schema";
import { AsyncData } from "foldkit";
import * as FoldkitFile from "foldkit/file";
import { Profile } from "@job-index/domain/Profile";
import { ThemePreferenceSchema, readThemePreference, type ThemePreference } from "../theme.ts";
import { Problem, RequestIdle, RequestStatus } from "../RequestStatus.ts";
import * as ExperienceEntry from "./ExperienceEntry.ts";

// `Problem` and `RequestStatus` stay defined once in the root `Model.ts` —
// every cluster's cache/request state shares the same failure and
// tri-state shapes, so this module imports the schema rather than
// restating a profile-flavoured copy.

export const MeResponse = S.Struct({
  profile: Profile,
  capabilities: S.Array(S.String),
  profileUpdatedAt: S.NullOr(S.String),
  /** WS-0019: whether model processors may receive this account's data. */
  aiConsent: S.Boolean,
});
export type MeResponse = typeof MeResponse.Type;
export const ProfileAsyncData = AsyncData.Schema(MeResponse, Problem);

/** The edit buffer for the profile form. A separate copy from the fetched
 *  `MeResponse` so typing does not retroactively change what "saved" means;
 *  `SaveClicked` is what commits it. `experience` is an array of
 *  `ExperienceEntry.Model` — each entry is edited as its own Submodel (see
 *  `ExperienceEntry.ts`), not a struct this form reaches into by index. */
export const ProfileForm = S.Struct({
  headline: S.String,
  summary: S.String,
  location: S.String,
  languages: S.String,
  /** Newline-separated in the form, split into `Profile.skills` on save. */
  skillsText: S.String,
  /** Newline-separated in the form, split into `Profile.education` on save. */
  educationText: S.String,
  desiredRolesText: S.String,
  desiredLocationsText: S.String,
  excludedTermsText: S.String,
  experience: S.Array(ExperienceEntry.Model),
});
export type ProfileForm = typeof ProfileForm.Type;

/** The local appearance preference rides inside this Submodel's Model (see
 *  WS-0013-r1): it is a per-visitor setting edited on the Profile page, but
 *  unlike everything above it is never sent to the server — localStorage and
 *  the document root are its whole world. */
export const themePreference: S.Schema<ThemePreference> = ThemePreferenceSchema;

export const ProposalRow = S.Struct({
  id: S.String,
  sourceKind: S.Literals(["text", "pdf"]),
  fieldPath: S.String,
  proposedValue: S.String,
  evidenceExcerpt: S.String,
  confidence: S.Literals(["high", "medium", "low"]),
  engine: S.Literals(["heuristic", "model"]),
  status: S.String,
  createdAt: S.String,
});
export type ProposalRow = typeof ProposalRow.Type;

export const ProposalListResponse = S.Struct({
  data: S.Array(ProposalRow),
});
export type ProposalListResponse = typeof ProposalListResponse.Type;

export const ProposalImportResponse = S.Struct({
  data: S.Array(ProposalRow),
  downgradeReason: S.NullOr(S.String),
});
export type ProposalImportResponse = typeof ProposalImportResponse.Type;

export const ProposalDecisionRequest = S.Struct({
  id: S.String,
  generation: S.Number,
  request: RequestStatus,
});
export type ProposalDecisionRequest = typeof ProposalDecisionRequest.Type;

export const Model = S.Struct({
  profile: ProfileAsyncData.schema,
  profileForm: S.Option(ProfileForm),
  persistedProfileForm: S.Option(ProfileForm),
  profileUpdatedAt: S.NullOr(S.String),
  profileSaving: RequestStatus,
  saveGeneration: S.Number,
  themePreference: ThemePreferenceSchema,
  // WS-0016: the import card and its pending-proposal queue. Each asynchronous
  // owner carries its own generation so an older completion cannot settle a
  // newer request.
  importText: S.String,
  importFileName: S.NullOr(S.String),
  importFile: S.Option(FoldkitFile.File),
  importing: RequestStatus,
  importGeneration: S.Number,
  importFeedback: S.NullOr(S.Literals(["no-extractable-pdf-text"])),
  proposals: S.Array(ProposalRow),
  proposalFetch: RequestStatus,
  proposalFetchGeneration: S.Number,
  downgradeReason: S.NullOr(S.String),
  editedProposalValues: S.Option(S.Record(S.String, S.String)),
  proposalDecisions: S.Array(ProposalDecisionRequest),
  proposalAnnouncement: S.NullOr(S.String),
  // WS-0019: the Privacy section. Consent flips optimistically and rolls
  // back on failure; deletion needs an explicit two-step confirm; export is
  // a plain download request.
  aiConsentPending: S.Boolean,
  /** The value to restore if the optimistic consent flip fails. */
  aiConsentRollbackValue: S.Boolean,
  consentGeneration: S.Number,
  deleteConfirmRevealed: S.Boolean,
  deleteConfirmed: S.Boolean,
  deleteRequest: RequestStatus,
  consentRequest: RequestStatus,
  exportRequest: RequestStatus,
  accountDeleted: S.Boolean,
});
export type Model = typeof Model.Type;

export const init = (): Model => ({
  profile: ProfileAsyncData.Idle(),
  profileForm: Option.none(),
  persistedProfileForm: Option.none(),
  profileUpdatedAt: null,
  profileSaving: RequestIdle(),
  saveGeneration: 0,
  themePreference: readThemePreference(),
  // The boot-time apply already ran in `entry.ts`; reading here mirrors that
  // same storage into state so the view renders what is applied.
  importText: "",
  importFileName: null,
  importFile: Option.none(),
  importing: RequestIdle(),
  importGeneration: 0,
  importFeedback: null,
  proposals: [],
  proposalFetch: RequestIdle(),
  proposalFetchGeneration: 0,
  downgradeReason: null,
  editedProposalValues: Option.none(),
  proposalDecisions: [],
  proposalAnnouncement: null,
  aiConsentPending: false,
  aiConsentRollbackValue: false,
  consentGeneration: 0,
  deleteConfirmRevealed: false,
  deleteConfirmed: false,
  deleteRequest: RequestIdle(),
  consentRequest: RequestIdle(),
  exportRequest: RequestIdle(),
  accountDeleted: false,
});

// Re-exported for the Message/update modules so they need not reach into
// `theme.ts` themselves.
export type { ThemePreference };
