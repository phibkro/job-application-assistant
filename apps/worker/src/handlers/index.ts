import { layer as authLayer } from "./auth.ts";
import { layer as corpusLayer } from "./corpus.ts";
import { layer as feedLayer } from "./feed.ts";
import { layer as profileLayer } from "./profile.ts";
import { layer as applicationsLayer } from "./applications.ts";

/**
 * Every handler this slot owns, named by group.
 *
 * Not a composition root: nothing here supplies `Corpus`, `Accounts`,
 * `Drafting`, `Applications`, `Entitlements`, or the three gap ports in
 * `ports.ts` — that wiring, and deciding what backs the ports, is the
 * integrator's step. This just names what each group needs `HttpApiBuilder`
 * to be handed.
 */
export const auth = authLayer;
export const corpus = corpusLayer;
export const feed = feedLayer;
export const profile = profileLayer;
export const applications = applicationsLayer;

export * from "./ports.ts";
