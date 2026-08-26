import { layer as authLayer } from "./auth.ts";
import { layer as corpusLayer } from "./corpus.ts";
import { layer as feedLayer } from "./feed.ts";
import { layer as proposalsLayer } from "./proposals.ts";
import { layer as profileLayer } from "./profile.ts";
import { layer as applicationsLayer } from "./applications.ts";
import { layer as documentsLayer } from "./documents.ts";
import { layer as statusLayer } from "./status.ts";

/**
 * Every handler this slot owns, named by group.
 *
 * Not a composition root: nothing here supplies `Corpus`, `Accounts`,
 * `Drafting`, `Applications`, `Entitlements`, or the three gap ports in
 * the service tags — that wiring, and deciding what backs them, is the
 * integrator's step. This just names what each group needs `HttpApiBuilder`
 * to be handed.
 * `status` is public read-only observability; it does not use `Authenticated`.
 */
export const auth = authLayer;
export const corpus = corpusLayer;
export const feed = feedLayer;
export const profile = profileLayer;
export const proposals = proposalsLayer;
export const applications = applicationsLayer;
export const documents = documentsLayer;
export const status = statusLayer;
