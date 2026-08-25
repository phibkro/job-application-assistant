import { preferencesOf } from "@job-index/domain/Profile";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import { AsyncData, Command } from "foldkit";
import * as FoldkitFile from "foldkit/file";
import type { Update } from "foldkit";
import { evo } from "foldkit/struct";
import * as Commands from "../Commands.ts";
import { settle } from "../Settle.ts";
import * as ExperienceEntry from "./ExperienceEntry.ts";
import * as Message from "./Message.ts";
import type { Model, ProfileForm } from "./Model.ts";
import { presetPreference, type ColorMode, type ThemePresetId } from "../theme.ts";
import { NetworkError, RequestFailed, RequestIdle, RequestPending } from "../RequestStatus.ts";
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

const editedValues = (model: Model): Record<string, string> =>
  Option.match(model.editedProposalValues, {
    onNone: () => ({}),
    onSome: (record) => record,
  });

const proposalDecisionOf = (model: Model, id: string) =>
  model.proposalDecisions.find((decision) => decision.id === id) ?? {
    id,
    generation: 0,
    request: RequestIdle(),
  };

const putProposalDecision = (model: Model, decision: Model["proposalDecisions"][number]): Model =>
  evo(model, {
    proposalDecisions: (current) => [
      ...current.filter((candidate) => candidate.id !== decision.id),
      decision,
    ],
  });

const beginProposalFetch = (model: Model): UpdateReturn => {
  const generation = model.proposalFetchGeneration + 1;
  return [
    evo(model, {
      proposalFetch: () => RequestPending(),
      proposalFetchGeneration: () => generation,
    }),
    [Commands.FetchProposals({ generation })],
  ];
};

const proposalValueKind = (proposedValue: string): "scalar" | "structured" => {
  try {
    const decoded: unknown = JSON.parse(proposedValue);
    return typeof decoded === "string" ? "scalar" : "structured";
  } catch {
    return "structured";
  }
};

const stringArraysEqual = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const profileFormsEqual = (left: ProfileForm, right: ProfileForm): boolean => {
  const leftProfile = ProfileFormCodec.toProfile(left);
  const rightProfile = ProfileFormCodec.toProfile(right);
  const leftPreferences = preferencesOf(leftProfile);
  const rightPreferences = preferencesOf(rightProfile);
  return (
    leftProfile.headline === rightProfile.headline &&
    leftProfile.summary === rightProfile.summary &&
    leftProfile.location === rightProfile.location &&
    leftProfile.languages === rightProfile.languages &&
    stringArraysEqual(leftProfile.skills, rightProfile.skills) &&
    stringArraysEqual(leftProfile.education, rightProfile.education) &&
    stringArraysEqual(leftPreferences.desiredRoles, rightPreferences.desiredRoles) &&
    stringArraysEqual(leftPreferences.desiredLocations, rightPreferences.desiredLocations) &&
    stringArraysEqual(leftPreferences.excludedTerms, rightPreferences.excludedTerms) &&
    leftProfile.experience.length === rightProfile.experience.length &&
    leftProfile.experience.every((entry, index) => {
      const candidate = rightProfile.experience[index];
      return (
        candidate !== undefined &&
        entry.title === candidate.title &&
        entry.employer === candidate.employer &&
        entry.period === candidate.period &&
        stringArraysEqual(entry.highlights, candidate.highlights)
      );
    })
  );
};

const profileFormIsDirty = (model: Model): boolean =>
  Option.match(model.profileForm, {
    onNone: () => false,
    onSome: (form) =>
      Option.match(model.persistedProfileForm, {
        onNone: () => true,
        onSome: (persisted) => !profileFormsEqual(form, persisted),
      }),
  });

const revisionIsCurrentOrNewer = (incoming: string | null, current: string | null): boolean =>
  current === null || (incoming !== null && incoming >= current);

export const update = (model: Model, message: Message.Message): UpdateReturn =>
  Match.value(message).pipe(
    withReturnType,
    Match.tagsExhaustive({
      Requested: () => [
        evo(model, { profile: () => AsyncData.Loading() }),
        [Commands.FetchProfile()],
      ],

      FetchSucceeded: ({ response }) => {
        const persistedForm = ProfileFormCodec.fromProfile(response.profile);
        return beginProposalFetch(
          evo(model, {
            profile: () => AsyncData.Success({ data: response }),
            profileForm: () => Option.some(persistedForm),
            persistedProfileForm: () => Option.some(persistedForm),
            profileUpdatedAt: () => response.profileUpdatedAt,
          }),
        );
      },
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
      DesiredRolesTextChanged: ({ value }) => [
        editProfileForm(model, (f) => evo(f, { desiredRolesText: () => value })),
        [],
      ],
      DesiredLocationsTextChanged: ({ value }) => [
        editProfileForm(model, (f) => evo(f, { desiredLocationsText: () => value })),
        [],
      ],
      ExcludedTermsTextChanged: ({ value }) => [
        editProfileForm(model, (f) => evo(f, { excludedTermsText: () => value })),
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

      SaveClicked: () => {
        if (
          model.profileSaving._tag === "Pending" ||
          model.proposalDecisions.some((decision) => decision.request._tag === "Pending")
        ) {
          return [model, []];
        }
        return Option.match(model.profileForm, {
          onNone: () => [model, []] as UpdateReturn,
          onSome: (form) => {
            const generation = model.saveGeneration + 1;
            return [
              evo(model, {
                profileSaving: () => RequestPending(),
                saveGeneration: () => generation,
              }),
              [
                Commands.SaveProfile({
                  profile: ProfileFormCodec.toProfile(form),
                  capabilities: Option.match(AsyncData.getData(model.profile), {
                    onNone: () => [],
                    onSome: (response) => response.capabilities,
                  }),
                  expectedUpdatedAt: model.profileUpdatedAt,
                  generation,
                }),
              ],
            ] as UpdateReturn;
          },
        });
      },
      SaveSucceeded: ({ generation, baseProfileUpdatedAt, response }) => {
        if (generation !== model.saveGeneration) return [model, []];
        if (
          baseProfileUpdatedAt !== model.profileUpdatedAt ||
          !revisionIsCurrentOrNewer(response.profileUpdatedAt, model.profileUpdatedAt)
        ) {
          return [evo(model, { profileSaving: () => RequestIdle() }), []];
        }
        const preserveDirtyForm = profileFormIsDirty(model);
        const persistedForm = ProfileFormCodec.fromProfile(response.profile);
        return [
          evo(model, {
            profile: () => AsyncData.Success({ data: response }),
            profileForm: (current) => (preserveDirtyForm ? current : Option.some(persistedForm)),
            persistedProfileForm: () => Option.some(persistedForm),
            profileUpdatedAt: () => response.profileUpdatedAt,
            profileSaving: () => RequestIdle(),
          }),
          [],
        ];
      },
      SaveFailed: ({ generation, baseProfileUpdatedAt, problem }) => {
        if (generation !== model.saveGeneration) return [model, []];
        return baseProfileUpdatedAt !== model.profileUpdatedAt
          ? [evo(model, { profileSaving: () => RequestIdle() }), []]
          : [evo(model, { profileSaving: () => RequestFailed({ problem }) }), []];
      },
      // Appearance (WS-0013-r1): both are local-only transitions — update
      // the preference, schedule the validated persist, touch nothing else.
      // A preset keeps the current mode; picking a mode keeps the current
      // palette selection (which may be off-preset).
      ThemePresetChanged: ({ value }) => {
        const themePreference = presetPreference(
          value as ThemePresetId,
          model.themePreference.mode,
        );
        return [
          evo(model, { themePreference: () => themePreference }),
          [Commands.PersistThemePreference({ preference: themePreference })],
        ];
      },
      ColorModeChanged: ({ value }) => {
        const themePreference = { ...model.themePreference, mode: value as ColorMode };
        return [
          evo(model, { themePreference: () => themePreference }),
          [Commands.PersistThemePreference({ preference: themePreference })],
        ];
      },
      ThemePersisted: () => [model, []],
      // --- WS-0016: import card + proposal queue ---------------------------
      ImportTextChanged: ({ value }) => {
        const supersedesPendingImport = model.importing._tag === "Pending";
        return [
          evo(model, {
            importText: () => value,
            importFile: (current) => (value.trim().length > 0 ? Option.none() : current),
            importFileName: (current) => (value.trim().length > 0 ? null : current),
            importing: () => RequestIdle(),
            importGeneration: (current) => (supersedesPendingImport ? current + 1 : current),
            importFeedback: () => null,
          }),
          [],
        ];
      },
      ImportFileSelected: ({ files }) => {
        const file = files[0];
        if (file === undefined) return [model, []];
        const supersedesPendingImport = model.importing._tag === "Pending";
        return [
          evo(model, {
            importText: () => "",
            importFile: () => Option.some(file),
            importFileName: () => FoldkitFile.name(file),
            importing: () => RequestIdle(),
            importGeneration: (current) => (supersedesPendingImport ? current + 1 : current),
            importFeedback: () => null,
          }),
          [],
        ];
      },
      ImportClicked: () => {
        if (model.importing._tag === "Pending") return [model, []];
        const generation = model.importGeneration + 1;
        if (model.importText.trim().length > 0) {
          return [
            evo(model, {
              importing: () => RequestPending(),
              importGeneration: () => generation,
              importFeedback: () => null,
            }),
            [
              Commands.ImportProfileDocument({
                content: model.importText,
                mimeType: "text/plain",
                generation,
              }),
            ],
          ];
        }
        return Option.match(model.importFile, {
          onNone: () => [model, []],
          onSome: (file) => [
            evo(model, {
              importing: () => RequestPending(),
              importGeneration: () => generation,
              importFeedback: () => null,
            }),
            [Commands.ImportProfileFile({ file, generation })],
          ],
        });
      },
      ImportSucceeded: ({ generation, mimeType, response }) => {
        if (generation !== model.importGeneration) return [model, []];
        return beginProposalFetch(
          evo(model, {
            proposals: () => response.data,
            downgradeReason: () => response.downgradeReason,
            importing: () => RequestIdle(),
            importText: () => "",
            importFileName: () => null,
            importFile: () => Option.none(),
            importFeedback: () =>
              mimeType === "application/pdf" && response.data.length === 0
                ? "no-extractable-pdf-text"
                : null,
          }),
        );
      },
      ImportFailed: ({ generation, problem }) =>
        generation !== model.importGeneration
          ? [model, []]
          : [evo(model, { importing: () => RequestFailed({ problem }) }), []],
      ProposalsRequested: () => beginProposalFetch(model),
      ProposalsFetchSucceeded: ({ generation, response }) =>
        generation !== model.proposalFetchGeneration
          ? [model, []]
          : [
              evo(model, {
                proposals: () => response.data,
                proposalFetch: () => RequestIdle(),
              }),
              [],
            ],
      ProposalsFetchFailed: ({ generation, problem }) =>
        generation !== model.proposalFetchGeneration
          ? [model, []]
          : [evo(model, { proposalFetch: () => RequestFailed({ problem }) }), []],
      ProposalEditChanged: ({ id, value }) => {
        const currentDecision = proposalDecisionOf(model, id);
        return [
          putProposalDecision(
            evo(model, {
              editedProposalValues: () =>
                Option.some({
                  ...editedValues(model),
                  [id]: value,
                }),
            }),
            {
              ...currentDecision,
              request:
                currentDecision.request._tag === "Failed" ? RequestIdle() : currentDecision.request,
            },
          ),
          [],
        ];
      },
      ProposalDecideClicked: ({ id, decision }) => {
        const proposal = model.proposals.find((candidate) => candidate.id === id);
        if (proposal === undefined) return [model, []];
        const currentDecision = proposalDecisionOf(model, id);
        if (currentDecision.request._tag === "Pending" || model.profileSaving._tag === "Pending") {
          return [model, []];
        }
        const generation = currentDecision.generation + 1;
        const edited = editedValues(model)[id];
        const valueKind = proposalValueKind(proposal.proposedValue);
        if (decision === "accepted" && edited !== undefined && valueKind === "structured") {
          try {
            const decoded: unknown = JSON.parse(edited);
            if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
              throw new TypeError("not an object");
            }
          } catch {
            return [
              putProposalDecision(evo(model, { proposalAnnouncement: () => null }), {
                id,
                generation,
                request: RequestFailed({
                  problem: NetworkError({
                    detail: "Enter a valid JSON object before accepting this proposal.",
                  }),
                }),
              }),
              [],
            ];
          }
        }
        return [
          putProposalDecision(evo(model, { proposalAnnouncement: () => null }), {
            id,
            generation,
            request: RequestPending(),
          }),
          [
            Commands.DecideProposal({
              proposalId: id,
              decision,
              value: edited === undefined ? Option.none() : Option.some(edited),
              valueKind,
              generation,
            }),
          ],
        ];
      },
      ProposalDecisionSucceeded: ({ id, generation, response }) => {
        const currentDecision = proposalDecisionOf(model, id);
        if (generation !== currentDecision.generation) return [model, []];
        const proposalIndex = model.proposals.findIndex((candidate) => candidate.id === id);
        const proposal = model.proposals[proposalIndex];
        const remaining = model.proposals.filter((candidate) => candidate.id !== id);
        const nextProposal = proposalIndex < 0 ? undefined : remaining[proposalIndex];
        const action = response.decision === "accepted" ? "Accepted" : "Discarded";
        const baseModel = evo(model, {
          proposals: () => remaining,
          proposalFetch: () => RequestIdle(),
          proposalFetchGeneration: (current) => current + 1,
          editedProposalValues: () =>
            Option.map(model.editedProposalValues, (record) =>
              Object.fromEntries(
                Object.entries(record).filter(([proposalId]) => proposalId !== id),
              ),
            ),
          proposalDecisions: (current) => current.filter((candidate) => candidate.id !== id),
          proposalAnnouncement: () =>
            proposal === undefined
              ? `${action} proposal. ${remaining.length} ${
                  remaining.length === 1 ? "proposal remains" : "proposals remain"
                }.`
              : `${action} proposal for ${proposal.fieldPath}. ${remaining.length} ${
                  remaining.length === 1 ? "proposal remains" : "proposals remain"
                }.`,
        });
        const nextModel = revisionIsCurrentOrNewer(
          response.profileUpdatedAt,
          model.profileUpdatedAt,
        )
          ? (() => {
              const preserveDirtyForm = profileFormIsDirty(model);
              const persistedForm = ProfileFormCodec.fromProfile(response.profile);
              return evo(baseModel, {
                profile: (current) =>
                  AsyncData.map(current, (profileResponse) => ({
                    ...profileResponse,
                    profile: response.profile,
                    profileUpdatedAt: response.profileUpdatedAt,
                  })),
                profileUpdatedAt: () => response.profileUpdatedAt,
                profileForm: (current) =>
                  preserveDirtyForm ? current : Option.some(persistedForm),
                persistedProfileForm: () => Option.some(persistedForm),
              });
            })()
          : baseModel;
        return [
          nextModel,
          [
            Commands.FocusProposalReview({
              selector:
                nextProposal === undefined
                  ? "#proposal-queue-heading"
                  : `#proposal-editor-${nextProposal.id}`,
            }),
          ],
        ];
      },
      ProposalDecisionFailed: ({ id, generation, problem }) => {
        const currentDecision = proposalDecisionOf(model, id);
        return generation !== currentDecision.generation
          ? [model, []]
          : [
              putProposalDecision(model, {
                id,
                generation,
                request: RequestFailed({ problem }),
              }),
              [],
            ];
      },
      ProposalFocusSettled: () => [model, []],
    }),
  );
