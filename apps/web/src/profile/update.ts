import * as Match from "effect/Match";
import * as Option from "effect/Option";
import { AsyncData, Command } from "foldkit";
import type { Update } from "foldkit";
import { evo } from "foldkit/struct";
import * as Commands from "../Commands.ts";
import { settle } from "../Settle.ts";
import * as ExperienceEntry from "./ExperienceEntry.ts";
import * as Message from "./Message.ts";
import type { Model, ProfileForm } from "./Model.ts";
import { RequestFailed, RequestIdle, RequestPending } from "../RequestStatus.ts";
import * as ProfileFormCodec from "./ProfileFormCodec.ts";

/**
 * No `OutMessage` channel: every arm here either answers a Message the root
 * itself dispatched (`Requested`, the two orchestration behaviours live in
 * the root's own `update`) or settles state this Model owns outright. There
 * is nothing this cluster needs to tell an ancestor that the ancestor can't
 * already read off `Model` — see `Update.combine`'s doc on `Return` vs
 * `ReturnWithOutMessage`: a Submodel without anything to say back returns
 * the plain shape, not a channel nobody ever fills.
 */
export type UpdateReturn = Update.Return<Model, Message.Message>;
const withReturnType = Match.withReturnType<UpdateReturn>();

const editProfileForm = (model: Model, transform: (form: ProfileForm) => ProfileForm): Model =>
  evo(model, { profileForm: (form) => Option.map(form, transform) });

export const update = (model: Model, message: Message.Message): UpdateReturn =>
  Match.value(message).pipe(
    withReturnType,
    Match.tagsExhaustive({
      Requested: () => [
        evo(model, { profile: () => AsyncData.Loading() }),
        [Commands.FetchProfile()],
      ],

      FetchSucceeded: ({ response }) => [
        evo(model, {
          profile: () => AsyncData.Success({ data: response }),
          profileForm: () => Option.some(ProfileFormCodec.fromProfile(response.profile)),
        }),
        [],
      ],
      FetchFailed: ({ problem }) => [evo(model, { profile: (r) => settle(r, problem) }), []],

      HeadlineChanged: ({ value }) => [
        editProfileForm(model, (f) => evo(f, { headline: () => value })),
        [],
      ],
      SummaryChanged: ({ value }) => [
        editProfileForm(model, (f) => evo(f, { summary: () => value })),
        [],
      ],
      LocationChanged: ({ value }) => [
        editProfileForm(model, (f) => evo(f, { location: () => value })),
        [],
      ],
      LanguagesChanged: ({ value }) => [
        editProfileForm(model, (f) => evo(f, { languages: () => value })),
        [],
      ],
      SkillsTextChanged: ({ value }) => [
        editProfileForm(model, (f) => evo(f, { skillsText: () => value })),
        [],
      ],
      EducationTextChanged: ({ value }) => [
        editProfileForm(model, (f) => evo(f, { educationText: () => value })),
        [],
      ],

      ExperienceAdded: () => [
        editProfileForm(model, (f) =>
          evo(f, { experience: (xs) => [...xs, ExperienceEntry.init()] }),
        ),
        [],
      ],

      // `id`, not index, addresses the entry — see `ExperienceEntry`'s and
      // `GotExperienceMessage`'s own docs for why an index would be wrong
      // the moment a sibling above it changes the list.
      GotExperienceMessage: ({ id, message: entryMessage }) =>
        Option.match(model.profileForm, {
          onNone: () => [model, []] as UpdateReturn,
          onSome: (form) => {
            const entry = form.experience.find((e) => e.id === id);
            if (entry === undefined) return [model, []] as UpdateReturn;
            const [nextEntry, entryCommands, maybeOut] = ExperienceEntry.update(
              entry,
              entryMessage,
            );
            const mappedCommands = Command.mapMessages(entryCommands, (childMessage) =>
              Message.GotExperienceMessage({ id, message: childMessage }),
            );
            const nextExperience = Option.isSome(maybeOut)
              ? form.experience.filter((e) => e.id !== id)
              : form.experience.map((e) => (e.id === id ? nextEntry : e));
            return [
              editProfileForm(model, (f) => evo(f, { experience: () => nextExperience })),
              mappedCommands,
            ] as UpdateReturn;
          },
        }),

      SaveClicked: () =>
        Option.match(model.profileForm, {
          onNone: () => [model, []] as UpdateReturn,
          onSome: (form) =>
            [
              evo(model, { profileSaving: () => RequestPending() }),
              [
                Commands.SaveProfile({
                  profile: ProfileFormCodec.toProfile(form),
                  capabilities: Option.match(AsyncData.getData(model.profile), {
                    onNone: () => [],
                    onSome: (response) => response.capabilities,
                  }),
                }),
              ],
            ] as UpdateReturn,
        }),
      SaveSucceeded: ({ response }) => [
        evo(model, {
          profile: () => AsyncData.Success({ data: response }),
          profileForm: () => Option.some(ProfileFormCodec.fromProfile(response.profile)),
          profileSaving: () => RequestIdle(),
        }),
        [],
      ],
      SaveFailed: ({ problem }) => [
        evo(model, { profileSaving: () => RequestFailed({ problem }) }),
        [],
      ],
    }),
  );
