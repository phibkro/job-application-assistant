import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as Etag from "effect/unstable/http/Etag";
import * as HttpPlatform from "effect/unstable/http/HttpPlatform";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { api } from "../Api.ts";
import { Corpus } from "../services/Corpus.ts";
import { Accounts, Profiles } from "../services/Accounts.ts";
import { Drafting } from "../services/Drafting.ts";
import { Entitlements } from "../services/Entitlements.ts";
import { Applications } from "../services/Applications.ts";
import { Judgements } from "../services/Judgements.ts";
import { SavedJobs } from "../services/SavedJobs.ts";
import { SourceCatalog } from "../services/SourceCatalog.ts";
import { layer as authLayer } from "./auth.ts";
import { layer as corpusLayer } from "./corpus.ts";
import { layer as feedLayer } from "./feed.ts";
import { layer as profileLayer } from "./profile.ts";
import { layer as applicationsLayer } from "./applications.ts";

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
});

const defaultAccounts = Layer.succeed(Accounts, {
  authenticate: unstubbed("Accounts", "authenticate"),
  profileOf: unstubbed("Accounts", "profileOf"),
  requestErasure: unstubbed("Accounts", "requestErasure"),
});

const defaultProfiles = Layer.succeed(Profiles, {
  get: unstubbed("Profiles", "get"),
  set: unstubbed("Profiles", "set"),
  answers: unstubbed("Profiles", "answers"),
  answer: unstubbed("Profiles", "answer"),
  unanswered: unstubbed("Profiles", "unanswered"),
});

const defaultDrafting = Layer.succeed(Drafting, {
  compose: unstubbed("Drafting", "compose"),
});

const defaultApplications = Layer.succeed(Applications, {
  prepare: unstubbed("Applications", "prepare"),
  setStatus: unstubbed("Applications", "setStatus"),
});

const defaultEntitlements = Layer.succeed(Entitlements, {
  has: unstubbed("Entitlements", "has"),
  require: unstubbed("Entitlements", "require"),
});

const defaultSavedJobs = Layer.succeed(SavedJobs, {
  save: unstubbed("SavedJobs", "save"),
  resolve: unstubbed("SavedJobs", "resolve"),
});

const defaultJudgements = Layer.succeed(Judgements, {
  record: unstubbed("Judgements", "record"),
});

const defaultSourceCatalog = Layer.succeed(SourceCatalog, {
  list: unstubbed("SourceCatalog", "list"),
});

const platform = Layer.mergeAll(Path.layer, FileSystem.layerNoop({}));

export interface Fakes {
  readonly corpus?: Layer.Layer<Corpus>;
  readonly accounts?: Layer.Layer<Accounts>;
  readonly profiles?: Layer.Layer<Profiles>;
  readonly drafting?: Layer.Layer<Drafting>;
  readonly applications?: Layer.Layer<Applications>;
  readonly entitlements?: Layer.Layer<Entitlements>;
  readonly savedJobs?: Layer.Layer<SavedJobs>;
  readonly judgements?: Layer.Layer<Judgements>;
  readonly sourceCatalog?: Layer.Layer<SourceCatalog>;
}

/**
 * The whole API, real handlers, fake services — a real `Request` goes in and
 * a real `Response` comes out, so a test proves the wire shape (encode,
 * decode, routing, the auth middleware) and not just a handler function
 * called directly.
 */
export const buildHandler = (fakes: Fakes = {}) => {
  const appLayer = HttpApiBuilder.layer(api).pipe(
    Layer.provide(corpusLayer),
    Layer.provide(feedLayer),
    Layer.provide(profileLayer),
    Layer.provide(applicationsLayer),
    Layer.provide(authLayer),
    Layer.provide(fakes.corpus ?? defaultCorpus),
    Layer.provide(fakes.accounts ?? defaultAccounts),
    Layer.provide(fakes.profiles ?? defaultProfiles),
    Layer.provide(fakes.drafting ?? defaultDrafting),
    Layer.provide(fakes.applications ?? defaultApplications),
    Layer.provide(fakes.entitlements ?? defaultEntitlements),
    Layer.provide(fakes.savedJobs ?? defaultSavedJobs),
    Layer.provide(fakes.judgements ?? defaultJudgements),
    Layer.provide(fakes.sourceCatalog ?? defaultSourceCatalog),
    Layer.provide(Etag.layer),
    Layer.provide(HttpPlatform.layer),
    Layer.provide(platform),
  );

  const built = HttpRouter.toWebHandler(appLayer, { disableLogger: true });

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
