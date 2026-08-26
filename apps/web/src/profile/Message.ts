import * as S from "effect/Schema";
import { m } from "foldkit/message";
import * as FoldkitFile from "foldkit/file";
import { Profile } from "@job-index/domain/Profile";
import { Problem } from "../RequestStatus.ts";
import { colorModes } from "../theme.ts";
import { MeResponse, ProposalImportResponse, ProposalListResponse } from "./Model.ts";
import * as ExperienceEntry from "./ExperienceEntry.ts";

/** The worker's create/list payloads, mirrored here so Message args remain
 * Schema fields while preserving their different downgrade contracts. */
const ProposalImportResponseShape = ProposalImportResponse;
const ProposalListResponseShape = ProposalListResponse;

/** The decide response carries the post-merge profile so the form buffer can
 *  be rebuilt without a second round trip. */
const ProposalDecisionResponseType = S.Struct({
  decision: S.Literals(["accepted", "discarded"]),
  profile: Profile,
  profileUpdatedAt: S.NullOr(S.String),
});

// The names here drop the `Profile` prefix the root union carried: the
// module namespace (`Profile.HeadlineChanged`, not
// `Profile.ProfileHeadlineChanged`) already says what these belong to,
// matching how `@foldkit/ui`'s Menu names its own messages (`Opened`, not
// `MenuOpened`).

export const Requested = m("Requested");
export const FetchSucceeded = m("FetchSucceeded", {
  consentGeneration: S.Number,
  response: MeResponse,
});
export const FetchFailed = m("FetchFailed", { consentGeneration: S.Number, problem: Problem });
export const HeadlineChanged = m("HeadlineChanged", { value: S.String });
export const SummaryChanged = m("SummaryChanged", { value: S.String });
export const LocationChanged = m("LocationChanged", { value: S.String });
export const LanguagesChanged = m("LanguagesChanged", { value: S.String });
export const SkillsTextChanged = m("SkillsTextChanged", { value: S.String });
export const EducationTextChanged = m("EducationTextChanged", { value: S.String });
export const DesiredRolesTextChanged = m("DesiredRolesTextChanged", { value: S.String });
export const DesiredLocationsTextChanged = m("DesiredLocationsTextChanged", { value: S.String });
export const ExcludedTermsTextChanged = m("ExcludedTermsTextChanged", { value: S.String });
export const ExperienceAdded = m("ExperienceAdded");
/** Wraps one `ExperienceEntry` instance's own Message, addressed by its
 *  stable `id` — the same id used as that entry's `slotId` — rather than by
 *  index, so a message already in flight for one entry cannot land on a
 *  different entry after a sibling above it is added or removed. */
export const GotExperienceMessage = m("GotExperienceMessage", {
  id: S.String,
  message: ExperienceEntry.Message,
});
export const SaveClicked = m("SaveClicked");
export const SaveSucceeded = m("SaveSucceeded", {
  generation: S.Number,
  baseProfileUpdatedAt: S.NullOr(S.String),
  response: MeResponse,
});
export const SaveFailed = m("SaveFailed", {
  generation: S.Number,
  baseProfileUpdatedAt: S.NullOr(S.String),
  problem: Problem,
});

// Appearance (WS-0013-r1): local-only preferences. Both arms schedule a
// `PersistThemePreference` command; neither touches the server.
export const ThemePresetChanged = m("ThemePresetChanged", {
  value: S.Literals(["fjord", "aurora", "birch", "heather", "pine", "polar-night"]),
});
export const ColorModeChanged = m("ColorModeChanged", { value: S.Literals(colorModes) });
/** Sole completion of `PersistThemePreference`. The write already happened
 *  synchronously inside the Command (DOM attributes + localStorage); like
 *  the root's `UrlPushed`, this exists so the update loop stays total. It
 *  lives in THIS union, not the root's: a Submodel's commands complete with
 *  their own cluster's messages (same rule `SaveProfile` follows). */
export const ThemePersisted = m("ThemePersisted");

// --- WS-0016: import from past document + proposal queue -------------------
export const ImportTextChanged = m("ImportTextChanged", { value: S.String });
export const ImportClicked = m("ImportClicked");
/** Native file-input payload. The opaque File is read only inside its Command. */
export const ImportFileSelected = m("ImportFileSelected", {
  files: S.Array(FoldkitFile.File),
});
export const ImportSucceeded = m("ImportSucceeded", {
  generation: S.Number,
  mimeType: S.Literals(["text/plain", "application/pdf"]),
  response: ProposalImportResponseShape,
});
export const ImportFailed = m("ImportFailed", { generation: S.Number, problem: Problem });
export const ProposalsRequested = m("ProposalsRequested");
export const ProposalsFetchSucceeded = m("ProposalsFetchSucceeded", {
  generation: S.Number,
  response: ProposalListResponseShape,
});
export const ProposalsFetchFailed = m("ProposalsFetchFailed", {
  generation: S.Number,
  problem: Problem,
});
export const ProposalEditChanged = m("ProposalEditChanged", { id: S.String, value: S.String });
export const ProposalDecideClicked = m("ProposalDecideClicked", {
  id: S.String,
  decision: S.Literals(["accepted", "discarded"]),
});
export const ProposalDecisionSucceeded = m("ProposalDecisionSucceeded", {
  id: S.String,
  generation: S.Number,
  response: ProposalDecisionResponseType,
});
export const ProposalDecisionFailed = m("ProposalDecisionFailed", {
  id: S.String,
  generation: S.Number,
  problem: Problem,
});
export const ProposalFocusSettled = m("ProposalFocusSettled");

// --- WS-0019: Privacy section — consent toggle, export, account deletion ----
export const ConsentToggled = m("ConsentToggled", { enabled: S.Boolean });
export const ConsentSetSucceeded = m("ConsentSetSucceeded", {
  aiConsent: S.Boolean,
  generation: S.Number,
});
export const ConsentSetFailed = m("ConsentSetFailed", {
  generation: S.Number,
  problem: Problem,
});
export const DeleteRevealToggled = m("DeleteRevealToggled", { revealed: S.Boolean });
export const DeleteConfirmChanged = m("DeleteConfirmChanged", { confirmed: S.Boolean });
export const DeleteClicked = m("DeleteClicked");
export const DeleteSucceeded = m("DeleteSucceeded", { at: S.String });
export const DeleteFailed = m("DeleteFailed", { problem: Problem });
export const ExportWorkspaceClicked = m("ExportWorkspaceClicked");
export const ExportSucceeded = m("ExportSucceeded");
export const ExportFailed = m("ExportFailed", { problem: Problem });

export const Message = S.Union([
  Requested,
  FetchSucceeded,
  FetchFailed,
  HeadlineChanged,
  SummaryChanged,
  LocationChanged,
  LanguagesChanged,
  SkillsTextChanged,
  EducationTextChanged,
  DesiredRolesTextChanged,
  DesiredLocationsTextChanged,
  ExcludedTermsTextChanged,
  ExperienceAdded,
  GotExperienceMessage,
  SaveClicked,
  SaveSucceeded,
  SaveFailed,
  ThemePresetChanged,
  ColorModeChanged,
  ThemePersisted,
  ImportTextChanged,
  ImportClicked,
  ImportFileSelected,
  ImportSucceeded,
  ImportFailed,
  ProposalsRequested,
  ProposalsFetchSucceeded,
  ProposalsFetchFailed,
  ProposalEditChanged,
  ProposalDecideClicked,
  ProposalDecisionSucceeded,
  ProposalDecisionFailed,
  ProposalFocusSettled,
  ConsentToggled,
  ConsentSetSucceeded,
  ConsentSetFailed,
  DeleteRevealToggled,
  DeleteConfirmChanged,
  DeleteClicked,
  DeleteSucceeded,
  DeleteFailed,
  ExportWorkspaceClicked,
  ExportSucceeded,
  ExportFailed,
]);
export type Message = typeof Message.Type;
