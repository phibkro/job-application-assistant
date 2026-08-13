import * as S from "effect/Schema";
import { m } from "foldkit/message";
import { Problem } from "../RequestStatus.ts";
import { MeResponse } from "./Model.ts";
import * as ExperienceEntry from "./ExperienceEntry.ts";

// The names here drop the `Profile` prefix the root union carried: the
// module namespace (`Profile.HeadlineChanged`, not
// `Profile.ProfileHeadlineChanged`) already says what these belong to,
// matching how `@foldkit/ui`'s Menu names its own messages (`Opened`, not
// `MenuOpened`).

export const Requested = m("Requested");
export const FetchSucceeded = m("FetchSucceeded", { response: MeResponse });
export const FetchFailed = m("FetchFailed", { problem: Problem });
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
export const SaveSucceeded = m("SaveSucceeded", { response: MeResponse });
export const SaveFailed = m("SaveFailed", { problem: Problem });

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
]);
export type Message = typeof Message.Type;
