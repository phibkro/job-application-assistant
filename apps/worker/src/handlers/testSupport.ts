import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import * as HttpRouter from "effect/http/HttpRouter";
import * as Etag from "effect/http/Etag";
import * as HttpPlatform from "effect/http/HttpPlatform";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { api } from "../Api.ts";
import { Corpus } from "../services/Corpus.ts";
import { Accounts, Profiles } from "../services/Accounts.ts";
import { Drafting } from "../services/Drafting.ts";
import { Entitlements } from "../services/Entitlements.ts";
import { Applications } from "../services/Applications.ts";
import { Saved } from "../services/Saved.ts";
import { Hydration } from "../services/Hydration.ts";
import { Judgements } from "../services/Judgements.ts";
import { SourceCatalog } from "../services/SourceCatalog.ts";
import { SavedJobs } from "../services/SavedJobs.ts";
import { ModelStudioComposer, TemplateStudioComposer } from "../services/Studio.ts";
import { Database } from "../services/Database.ts";
import { Ids } from "../services/Ids.ts";
import { Extraction } from "../services/Extraction.ts";
import { HeuristicInference, ModelInference } from "../services/Inference.ts";
import { layer as authLayer } from "./auth.ts";
import { layer as corpusLayer } from "./corpus.ts";
import { layer as feedLayer } from "./feed.ts";
import { layer as profileLayer } from "./profile.ts";
import { layer as proposalsLayer } from "./proposals.ts";
import { layer as ingestionLayer } from "./status.ts";
import { layer as applicationsLayer } from "./applications.ts";
import { layer as documentsLayer } from "./documents.ts";
import { layer as accountLayer } from "./account.ts";

/**
 * A fake that dies with the caller's name when hit, rather than returning a
 * plausible-looking default. A test that forgets to stub the method it
 * exercises should fail on "unstubbed: Corpus.get", not on a wrong answer
 * three assertions later.
 */
const unstubbed = (tag: string, method: string) => () =>
  Effect.die(new Error(`unstubbed: ${tag}.${method}`));

const defaultCorpus = Layer.succeed(Corpus, {
  observe: unstubbed("Corpus", "observe"),
  get: unstubbed("Corpus", "get"),
  changedSince: unstubbed("Corpus", "changedSince"),
  search: unstubbed("Corpus", "search"),
  fresh: unstubbed("Corpus", "fresh"),
  markOffered: unstubbed("Corpus", "markOffered"),
  closeAbsent: unstubbed("Corpus", "closeAbsent"),
  occurrenceFor: unstubbed("Corpus", "occurrenceFor"),
  hydrateDetail: unstubbed("Corpus", "hydrateDetail"),
  closeEarly: unstubbed("Corpus", "closeEarly"),
});

const defaultHydration = Layer.succeed(Hydration, {
  hydrate: unstubbed("Hydration", "hydrate"),
});

const defaultAccounts = Layer.succeed(Accounts, {
  authenticate: unstubbed("Accounts", "authenticate"),
  profileOf: unstubbed("Accounts", "profileOf"),
  requestErasure: unstubbed("Accounts", "requestErasure"),
});

const defaultProfiles = Layer.succeed(Profiles, {
  get: unstubbed("Profiles", "get"),
  set: unstubbed("Profiles", "set"),
  getVersioned: unstubbed("Profiles", "getVersioned"),
  setVersioned: unstubbed("Profiles", "setVersioned"),
  answers: unstubbed("Profiles", "answers"),
  answer: unstubbed("Profiles", "answer"),
  unanswered: unstubbed("Profiles", "unanswered"),
  aiConsent: unstubbed("Profiles", "aiConsent"),
  setAiConsent: unstubbed("Profiles", "setAiConsent"),
});

const defaultDrafting = Layer.succeed(Drafting, {
  compose: unstubbed("Drafting", "compose"),
});
const defaultApplications = Layer.succeed(Applications, {
  prepare: unstubbed("Applications", "prepare"),
  recordEvent: unstubbed("Applications", "recordEvent"),
  setStatus: unstubbed("Applications", "setStatus"),
  historyForSaved: unstubbed("Applications", "historyForSaved"),
  history: unstubbed("Applications", "history"),
});

const defaultEntitlements = Layer.succeed(Entitlements, {
  has: unstubbed("Entitlements", "has"),
  require: unstubbed("Entitlements", "require"),
});

const defaultSavedJobs = Layer.succeed(SavedJobs, {
  save: unstubbed("SavedJobs", "save"),
  resolve: unstubbed("SavedJobs", "resolve"),
  list: unstubbed("SavedJobs", "list"),
});

const defaultSaved = Layer.succeed(Saved, {
  list: unstubbed("Saved", "list"),
  labels: unstubbed("Saved", "labels"),
  createLabel: unstubbed("Saved", "createLabel"),
  renameLabel: unstubbed("Saved", "renameLabel"),
  deleteLabel: unstubbed("Saved", "deleteLabel"),
  setLabels: unstubbed("Saved", "setLabels"),
});

const defaultJudgements = Layer.succeed(Judgements, {
  record: unstubbed("Judgements", "record"),
});

let idCounter = 0;
const defaultIds = Layer.succeed(Ids, {
  next: Effect.sync(() => "test-id-" + ++idCounter),
});

const defaultExtraction = Layer.succeed(Extraction, {
  extract: unstubbed("Extraction", "extract"),
});

const defaultHeuristicInference = Layer.succeed(HeuristicInference, {
  propose: unstubbed("HeuristicInference", "propose"),
});

const defaultModelInference = Layer.succeed(ModelInference, {
  propose: unstubbed("ModelInference", "propose"),
});

const defaultTemplateStudio = Layer.succeed(TemplateStudioComposer, {
  compose: unstubbed("TemplateStudioComposer", "compose"),
});

const defaultModelStudio = Layer.succeed(ModelStudioComposer, {
  compose: unstubbed("ModelStudioComposer", "compose"),
});

const defaultSourceCatalog = Layer.succeed(SourceCatalog, {
  list: unstubbed("SourceCatalog", "list"),
});

const defaultDatabase = Layer.succeed(Database, {
  query: unstubbed("Database", "query"),
  run: unstubbed("Database", "run"),
  runAffected: unstubbed("Database", "runAffected"),
  atomicAffected: unstubbed("Database", "atomicAffected"),
  atomic: unstubbed("Database", "atomic"),
});

const platform = Layer.mergeAll(Path.layer, FileSystem.layerNoop({}));

export interface Fakes {
  readonly corpus?: Layer.Layer<Corpus>;
  readonly accounts?: Layer.Layer<Accounts>;
  readonly profiles?: Layer.Layer<Profiles>;
  readonly drafting?: Layer.Layer<Drafting>;
  readonly applications?: Layer.Layer<Applications>;
  readonly entitlements?: Layer.Layer<Entitlements>;
  readonly hydration?: Layer.Layer<Hydration>;
  readonly judgements?: Layer.Layer<Judgements>;
  readonly database?: Layer.Layer<Database>;
  readonly sourceCatalog?: Layer.Layer<SourceCatalog>;
  readonly savedJobs?: Layer.Layer<SavedJobs>;
  readonly saved?: Layer.Layer<Saved>;
  readonly extraction?: Layer.Layer<Extraction>;
  readonly heuristicInference?: Layer.Layer<HeuristicInference>;
  readonly modelInference?: Layer.Layer<ModelInference>;
  readonly templateStudioComposer?: Layer.Layer<TemplateStudioComposer>;
  readonly modelStudioComposer?: Layer.Layer<ModelStudioComposer>;
  readonly ids?: Layer.Layer<Ids>;
}

/**
 * The whole API, real handlers, fake services — a real `Request` goes in and
 * a real `Response` comes out, so a test proves the wire shape (encode,
 * decode, routing, the auth middleware) and not just a handler function
 * called directly.
 */
export const buildHandler = (fakes: Fakes = {}) => {
  const serviceLayers = Layer.mergeAll(
    fakes.corpus ?? defaultCorpus,
    fakes.accounts ?? defaultAccounts,
    fakes.profiles ?? defaultProfiles,
    fakes.drafting ?? defaultDrafting,
    fakes.applications ?? defaultApplications,
    fakes.entitlements ?? defaultEntitlements,
    fakes.hydration ?? defaultHydration,
    fakes.savedJobs ?? defaultSavedJobs,
    fakes.saved ?? defaultSaved,
    fakes.database ?? defaultDatabase,
    fakes.extraction ?? defaultExtraction,
    fakes.judgements ?? defaultJudgements,
    fakes.sourceCatalog ?? defaultSourceCatalog,
    fakes.heuristicInference ?? defaultHeuristicInference,
    fakes.modelInference ?? defaultModelInference,
    fakes.templateStudioComposer ?? defaultTemplateStudio,
    fakes.modelStudioComposer ?? defaultModelStudio,
    fakes.ids ?? defaultIds,
  );
  const appLayer = HttpApiBuilder.layer(api).pipe(
    Layer.provide(ingestionLayer),
    Layer.provide(corpusLayer),
    Layer.provide(feedLayer),
    Layer.provide(proposalsLayer),
    Layer.provide(profileLayer),
    Layer.provide(applicationsLayer),
    Layer.provide(documentsLayer),
    Layer.provide(accountLayer),
    Layer.provide(authLayer),
    Layer.provide(serviceLayers),
    Layer.provide(Etag.layer),
    Layer.provide(HttpPlatform.layer),
    Layer.provide(platform),
  );

  const built = HttpRouter.toWebHandler(appLayer, {
    disableLogger: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  // Every requirement above is discharged by a fake or a platform layer, so
  // the router's own `ReqR` is `never` — but merging nine service layers in
  // one pass is more than the compiler tracks precisely, and it widens the
  // inferred second parameter to `Context<any>` instead of proving it's
  // `never` and making that parameter optional. An empty context is the
  // correct value either way; this hides the widening from every test file
  // rather than making each one pass it.
  const handler = (request: Request): Promise<Response> =>
    (built.handler as (request: Request, context: Context.Context<never>) => Promise<Response>)(
      request,
      Context.empty(),
    );

  return { handler, dispose: built.dispose };
};
