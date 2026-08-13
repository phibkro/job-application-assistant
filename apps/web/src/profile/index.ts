// The profile cluster's public surface — everything the root program needs
// to embed this Submodel (`Model`, `init`, `view`) and drive it
// (`Message` and its variants, `update`). Mirrors `@foldkit/ui`'s own
// `<component>/public.ts` barrels: an explicit list, not `export *`, so
// what this module promises the root is a decision made here, not whatever
// happens to be exported from whichever file today.
export { MeResponse, ProfileAsyncData, ProfileForm, Model, init } from "./Model.ts";
export {
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
  Message,
} from "./Message.ts";
export { update } from "./update.ts";
export { view } from "./view.ts";
export type { ViewInputs } from "./view.ts";
