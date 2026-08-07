import * as Option from "effect/Option";
import * as S from "effect/Schema";
import { AsyncData } from "foldkit";
import { Profile } from "@job-index/domain/Profile";
import { Problem, RequestIdle, RequestStatus } from "../RequestStatus.ts";
import * as ExperienceEntry from "./ExperienceEntry.ts";

// `Problem` and `RequestStatus` stay defined once in the root `Model.ts` —
// every cluster's cache/request state shares the same failure and
// tri-state shapes, so this module imports the schema rather than
// restating a profile-flavoured copy.

export const MeResponse = S.Struct({ profile: Profile, capabilities: S.Array(S.String) });
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
  experience: S.Array(ExperienceEntry.Model),
});
export type ProfileForm = typeof ProfileForm.Type;

export const Model = S.Struct({
  profile: ProfileAsyncData.schema,
  profileForm: S.Option(ProfileForm),
  profileSaving: RequestStatus,
});
export type Model = typeof Model.Type;

export const init = (): Model => ({
  profile: ProfileAsyncData.Idle(),
  profileForm: Option.none(),
  profileSaving: RequestIdle(),
});
