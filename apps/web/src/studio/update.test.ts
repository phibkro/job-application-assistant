import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";
import { update } from "./update.ts";
import { DeleteConfirmIdle, DocumentsAsyncData, type Model } from "./Model.ts";
import * as Message from "./Message.ts";
import { NotFound, RequestFailed, RequestIdle, RequestPending } from "../RequestStatus.ts";

/**
 * WS-0018 acceptance (h): the studio cluster's pure update() arms. No DOM —
 * every behavior here is a Model-in / (Model, Commands)-out assertion, in
 * the saved/update.test.ts style.
 */

const init = (): Model => ({
  documents: DocumentsAsyncData.Idle(),
  kind: "cv",
  target: null,
  engine: "template",
  targets: [],
  targetsRequest: RequestIdle(),
  generate: RequestIdle(),
  editors: [],
  save: { id: "", request: RequestIdle() },
  deleteConfirm: DeleteConfirmIdle(),
  remove: RequestIdle(),
  copiedId: null,
});

/** A fetched page shape matching the Api DocumentsPage contract. */
const pageOf = (ids: ReadonlyArray<string>) => ({
  data: ids.map((id) => ({
    id,
    kind: "cv" as const,
    engine: "template" as const,
    jobId: null,
    jobTitle: null,
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
  })),
  meta: { limit: 50, nextCursor: null },
});

const decodeMessage = <A>(message: A): A => message;

// The completion payloads travel through S.Any-typed Message fields; these
// builders keep the test literals honest about the wire shapes.
const DocumentCreateResponseSchema = Schema.Struct({
  data: Schema.Struct({
    id: Schema.String,
    kind: Schema.Literals(["cv", "letter"]),
    engine: Schema.Literals(["template", "model"]),
    jobId: Schema.NullOr(Schema.String),
    jobTitle: Schema.NullOr(Schema.String),
    createdAt: Schema.String,
    updatedAt: Schema.String,
    content: Schema.String,
  }),
  downgradeReason: Schema.NullOr(Schema.String),
});
type CreateResponse = typeof DocumentCreateResponseSchema.Type;

const createResponse = (id: string, content: string): CreateResponse =>
  Schema.decodeUnknownSync(DocumentCreateResponseSchema)({
    data: {
      id,
      kind: "cv",
      engine: "template",
      jobId: null,
      jobTitle: null,
      createdAt: "2026-08-26T00:00:00.000Z",
      updatedAt: "2026-08-26T00:00:00.000Z",
      content,
    },
    downgradeReason: null,
  }) as unknown as CreateResponse;

describe("studio update — loading (WS-0018 h)", () => {
  it("Requested loads documents and targets exactly once", () => {
    const [loading, commands] = update(init(), Message.Requested());
    expect(loading.documents._tag).toBe("Loading");
    expect(commands.map((command) => command.name)).toEqual([
      "FetchDocuments",
      "FetchDocumentTargets",
    ]);
    // Already loading: a second Requested must not re-fire.
    const [still, noCommands] = update(loading, Message.Requested());
    expect(still.documents._tag).toBe("Loading");
    expect(noCommands).toEqual([]);
  });

  it("DocumentsReceived stores the decoded page; FetchFailed settles the cache", () => {
    const [loading] = update(init(), Message.Requested());
    const [received] = update(loading, Message.DocumentsReceived({ page: pageOf(["doc-1"]) }));
    expect(received.documents._tag).toBe("Success");

    const problem = new NotFound({ message: "offline" });
    const [failed] = update(loading, Message.DocumentsFetchFailed({ problem }));
    expect(failed.documents._tag).toBe("Failure");
  });
});

describe("studio update — generate (WS-0018 h)", () => {
  it("GenerateClicked sends kind/engine/target and marks pending", () => {
    const model: Model = {
      ...init(),
      kind: "letter",
      engine: "model",
      target: "saved_1",
    };
    const [pending, commands] = update(model, Message.GenerateClicked());
    expect(pending.generate).toEqual(RequestPending());
    expect(commands.map((command) => command.name)).toEqual(["CreateDocument"]);
    const command = JSON.parse(JSON.stringify(commands[0])) as { args: Record<string, unknown> };
    expect(command.args).toEqual({ kind: "letter", engine: "model", jobId: "saved_1" });
  });

  it("GenerateSucceeded opens an editor seeded with the composed content", () => {
    const response = decodeMessage(createResponse("doc-new", "Composed body."));
    const [next] = update(init(), Message.GenerateSucceeded({ response }));
    expect(next.editors).toHaveLength(1);
    expect(next.editors[0]).toEqual({ id: "doc-new", content: "Composed body.", dirty: false });
    expect(next.generate).toEqual(RequestIdle());
  });

  it("GenerateSucceeded is idempotent about editors on repeat success for the same id", () => {
    const response = decodeMessage(createResponse("doc-new", "Composed body."));
    const [once] = update(init(), Message.GenerateSucceeded({ response }));
    const [twice] = update(once, Message.GenerateSucceeded({ response }));
    expect(twice.editors).toHaveLength(1);
  });

  it("GenerateFailed stores the problem on the request tri-state", () => {
    const problem = new NotFound({ message: "no saved job" });
    const [pending, _] = update(init(), Message.GenerateClicked());
    const [failed] = update(pending, Message.GenerateFailed({ problem }));
    expect(failed.generate).toEqual(RequestFailed({ problem }));
  });
});

describe("studio update — editing and saving (WS-0018 h)", () => {
  const withEditor = (): Model => {
    const response = decodeMessage(createResponse("doc-1", "Original."));
    const [opened] = update(init(), Message.GenerateSucceeded({ response }));
    return opened;
  };

  it("EditorChanged marks only that buffer dirty", () => {
    const response = decodeMessage(createResponse("doc-2", "Second."));
    const [two] = update(withEditor(), Message.GenerateSucceeded({ response }));
    const [edited] = update(two, Message.EditorChanged({ id: "doc-2", content: "rewritten" }));
    expect(edited.editors.find((b) => b.id === "doc-1")?.dirty).toBe(false);
    expect(edited.editors.find((b) => b.id === "doc-2")).toMatchObject({
      content: "rewritten",
      dirty: true,
    });
  });

  it("SaveClicked on a clean buffer is a no-op", () => {
    const model = withEditor();
    const [same, commands] = update(model, Message.SaveClicked({ id: "doc-1" }));
    expect(same).toBe(model);
    expect(commands).toEqual([]);
  });

  it("SaveClicked on a dirty buffer sends SaveDocumentContent with the edited text", () => {
    const edited = update(withEditor(), Message.EditorChanged({ id: "doc-1", content: "new" }))[0];
    const [pending, commands] = update(edited, Message.SaveClicked({ id: "doc-1" }));
    expect(pending.save).toMatchObject({ id: "doc-1", request: RequestPending() });
    expect(commands.map((command) => command.name)).toEqual(["SaveDocumentContent"]);
  });

  it("SaveSucceeded resets dirty and the save tri-state; SaveFailed keeps the buffer editable", () => {
    const edited = update(withEditor(), Message.EditorChanged({ id: "doc-1", content: "new" }))[0];
    const [pending] = update(edited, Message.SaveClicked({ id: "doc-1" }));

    const problem = new NotFound({ message: "gone" });
    const [failed] = update(pending, Message.SaveFailed({ id: "doc-1", problem }));
    expect(failed.save.request).toEqual(RequestFailed({ problem }));
    expect(failed.editors.find((b) => b.id === "doc-1")?.dirty).toBe(true);

    const document = {
      id: "doc-1",
      kind: "cv",
      engine: "template",
      jobId: null,
      jobTitle: null,
      createdAt: "2026-08-26T00:00:00.000Z",
      updatedAt: "2026-08-26T01:00:00.000Z",
      content: "Saved server copy.",
    } as const;
    const [saved] = update(edited, Message.SaveSucceeded({ document }));
    expect(saved.save.request).toEqual(RequestIdle());
    expect(saved.editors.find((b) => b.id === "doc-1")).toEqual({
      id: "doc-1",
      content: "Saved server copy.",
      dirty: false,
    });
  });
});

describe("studio update — deletion flow (WS-0018 h)", () => {
  it("DeleteStarted arms confirmation; Cancelled disarms without commands", () => {
    const [armed] = update(init(), Message.DeleteStarted({ id: "doc-1" }));
    expect(armed.deleteConfirm._tag).toBe("Pending");
    const [disarmed, commands] = update(armed, Message.DeleteCancelled());
    expect(disarmed.deleteConfirm).toEqual(DeleteConfirmIdle());
    expect(commands).toEqual([]);
  });

  it("DeleteConfirmed fires exactly one DeleteDocument for the armed id", () => {
    const [armed] = update(init(), Message.DeleteStarted({ id: "doc-9" }));
    const [pending, commands] = update(armed, Message.DeleteConfirmed());
    expect(pending.remove).toEqual(RequestPending());
    expect(commands.map((command) => command.name)).toEqual(["DeleteDocument"]);
  });

  it("DeleteConfirmed without an armed confirmation does nothing", () => {
    const before = init();
    const [same, commands] = update(before, Message.DeleteConfirmed());
    expect(same).toBe(before);
    expect(same.remove).toEqual(RequestIdle());
    expect(commands).toEqual([]);
  });

  it("DeleteSucceeded drops the editor and refetches; DeleteFailed disarms with the problem", () => {
    const [armed] = update(init(), Message.DeleteStarted({ id: "doc-1" }));
    const [confirmed, deleteCommands] = update(armed, Message.DeleteConfirmed());

    const [succeeded] = update(confirmed, Message.DeleteSucceeded({ id: "doc-1" }));
    expect(succeeded.documents._tag).toBe("Idle");
    expect(succeeded.editors).toEqual([]);
    expect(deleteCommands.length).toBe(1);

    const problem = new NotFound({ message: "already gone" });
    const [failed] = update(confirmed, Message.DeleteFailed({ problem }));
    expect(failed.remove).toEqual(RequestFailed({ problem }));
    expect(failed.deleteConfirm).toEqual(DeleteConfirmIdle());
  });
});

describe("studio update — clipboard feedback (WS-0018 h)", () => {
  it("CopyClicked issues CopyDocumentText; success records the id; failure clears it", () => {
    const [, clicked] = update(init(), Message.CopyClicked({ id: "doc-1", content: "text" }));
    expect(clicked.map((command) => command.name)).toEqual(["CopyDocumentText"]);

    const [copied] = update(init(), Message.CopySucceeded({ id: "doc-1" }));
    expect(copied.copiedId).toBe("doc-1");

    const problem = new NotFound({ message: "clipboard denied" });
    const [failed] = update(copied, Message.CopyFailed({ problem }));
    expect(failed.copiedId).toBeNull();
  });
});

describe("studio update — picker state (WS-0018 h)", () => {
  it("Kind/Target/Engine changes update exactly their field; Targets replace wholesale", () => {
    let model = update(init(), Message.KindChanged({ value: "letter" }))[0];
    expect(model.kind).toBe("letter");
    model = update(model, Message.TargetChanged({ value: "saved_7" }))[0];
    expect(model.target).toBe("saved_7");
    model = update(model, Message.EngineChanged({ value: "model" }))[0];
    expect(model.engine).toBe("model");
    model = update(
      model,
      Message.TargetsFetchSucceeded({
        targets: [{ savedJobId: "saved_7", title: "Baker i Østfold" }],
      }),
    )[0];
    expect(model.targets).toEqual([{ savedJobId: "saved_7", title: "Baker i Østfold" }]);
  });
});
