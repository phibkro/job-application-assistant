import * as Layer from "effect/Layer";
import { layer as accountsLayer } from "./accounts.ts";
import { layer as profilesLayer } from "./profiles.ts";

/**
 * Identity and the CV it carries, composed as one layer because a caller
 * that wants one nearly always wants the other — a request resolves a
 * credential to a profile, then reads or writes that profile's CV.
 */
export const layer = Layer.mergeAll(accountsLayer, profilesLayer);
