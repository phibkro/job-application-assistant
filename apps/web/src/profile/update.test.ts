import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import { NotFound } from "../RequestStatus.ts";
import * as ExperienceEntry from "./ExperienceEntry.ts";
import * as Message from "./Message.ts";
import { init, type Model, type MeResponse } from "./Model.ts";
import { update } from "./update.ts";

/**
 * The profile cluster's own `update`, tested against its own small Model —
 * the localization the Submodel split is for. `SessionCleared`'s "reset via
 * `init`" behaviour and the `UrlChanged`-to-Profile fetch gate are root
 * orchestration and stay covered in `update.test.ts` instead: this file
 * only owns what the Submodel itself decides.
 */

const meResponse: MeResponse = {
  profile: {
    headline: "Engineer",
    summary: "Builds things.",
    location: "Oslo",
    languages: "English",
    skills: ["TypeScript"],
    education: ["BSc"],
    experience: [
      { title: "Engineer", employer: "Acme", period: "2020-2023", highlights: ["Shipped X"] },
    ],
  },
  capabilities: ["draft"],
};

describe("Requested", () => {
  it("starts loading and asks the server for the profile", () => {
    const [model, commands] = update(init(), Message.Requested());
    expect(model.profile._tag).toBe("Loading");
    expect(commands.map((c) => c.name)).toEqual(["FetchProfile"]);
  });
});

describe("FetchSucceeded / FetchFailed", () => {
  it("FetchSucceeded populates both the cache and a fresh edit buffer from it", () => {
    const [model] = update(init(), Message.FetchSucceeded({ response: meResponse }));
    expect(model.profile).toEqual({ _tag: "Success", data: meResponse });
    expect(Option.isSome(model.profileForm)).toBe(true);
    const form = Option.getOrThrow(model.profileForm);
    expect(form.headline).toBe("Engineer");
    expect(form.skillsText).toBe("TypeScript");
    expect(form.experience).toHaveLength(1);
    expect(form.experience[0]?.title).toBe("Engineer");
  });

  it("FetchFailed on a first load becomes a bare Failure", () => {
    const loading: Model = { ...init(), profile: { _tag: "Loading" } };
    const [model] = update(
      loading,
      Message.FetchFailed({ problem: new NotFound({ message: "no" }) }),
    );
    expect(model.profile._tag).toBe("Failure");
  });
});

describe("field edits", () => {
  const loaded: Model = update(init(), Message.FetchSucceeded({ response: meResponse }))[0];

  it("HeadlineChanged edits only the buffer, never the fetched cache", () => {
    const [model] = update(loaded, Message.HeadlineChanged({ value: "Staff Engineer" }));
    expect(Option.getOrThrow(model.profileForm).headline).toBe("Staff Engineer");
    expect(model.profile).toEqual(loaded.profile);
  });

  it("a field edit before anything has loaded is a no-op — there is no buffer to edit", () => {
    const [model] = update(init(), Message.HeadlineChanged({ value: "x" }));
    expect(model.profileForm).toEqual(Option.none());
  });
});

describe("experience list", () => {
  const loaded: Model = update(init(), Message.FetchSucceeded({ response: meResponse }))[0];

  it("ExperienceAdded appends a fresh entry with its own id", () => {
    const [model] = update(loaded, Message.ExperienceAdded());
    const experience = Option.getOrThrow(model.profileForm).experience;
    expect(experience).toHaveLength(2);
    expect(experience[1]?.id).not.toBe(experience[0]?.id);
    expect(experience[1]?.title).toBe("");
  });

  it("GotExperienceMessage addresses the entry by id, not position", () => {
    const withSecond = update(loaded, Message.ExperienceAdded())[0];
    const [first, second] = Option.getOrThrow(withSecond.profileForm).experience;
    const [model] = update(
      withSecond,
      Message.GotExperienceMessage({
        id: second!.id,
        message: ExperienceEntry.TitleChanged({ value: "Second job" }),
      }),
    );
    const experience = Option.getOrThrow(model.profileForm).experience;
    expect(experience[0]).toEqual(first);
    expect(experience[1]?.title).toBe("Second job");
  });

  it("a RemoveClicked OutMessage removes exactly that entry", () => {
    const withSecond = update(loaded, Message.ExperienceAdded())[0];
    const [first, second] = Option.getOrThrow(withSecond.profileForm).experience;
    const [model] = update(
      withSecond,
      Message.GotExperienceMessage({ id: first!.id, message: ExperienceEntry.RemoveClicked() }),
    );
    const experience = Option.getOrThrow(model.profileForm).experience;
    expect(experience).toEqual([second]);
  });

  it("a message for an id no longer in the list is a no-op", () => {
    const [model] = update(
      loaded,
      Message.GotExperienceMessage({
        id: "does-not-exist",
        message: ExperienceEntry.TitleChanged({ value: "x" }),
      }),
    );
    expect(model).toBe(loaded);
  });
});

describe("SaveClicked", () => {
  it("with no buffer loaded is a no-op", () => {
    const empty = init();
    const [model, commands] = update(empty, Message.SaveClicked());
    expect(model).toBe(empty);
    expect(commands).toEqual([]);
  });

  it("carries the fetched capabilities forward — setProfile cannot change what an account is entitled to", () => {
    const loaded: Model = update(init(), Message.FetchSucceeded({ response: meResponse }))[0];
    const [model, commands] = update(loaded, Message.SaveClicked());
    expect(model.profileSaving).toEqual({ _tag: "Pending" });
    expect(commands.map((c) => c.name)).toEqual(["SaveProfile"]);
    expect(commands[0]?.args).toMatchObject({ capabilities: ["draft"] });
  });

  it("SaveSucceeded refreshes the cache and clears Pending", () => {
    const pending: Model = {
      ...update(init(), Message.FetchSucceeded({ response: meResponse }))[0],
      profileSaving: { _tag: "Pending" },
    };
    const [model] = update(pending, Message.SaveSucceeded({ response: meResponse }));
    expect(model.profileSaving).toEqual({ _tag: "Idle" });
    expect(model.profile).toEqual({ _tag: "Success", data: meResponse });
  });

  it("SaveFailed surfaces the Problem without touching the cached profile", () => {
    const pending: Model = {
      ...update(init(), Message.FetchSucceeded({ response: meResponse }))[0],
      profileSaving: { _tag: "Pending" },
    };
    const [model] = update(
      pending,
      Message.SaveFailed({ problem: new NotFound({ message: "no" }) }),
    );
    expect(model.profileSaving).toEqual({
      _tag: "Failed",
      problem: new NotFound({ message: "no" }),
    });
    expect(model.profile).toEqual(pending.profile);
  });
});
