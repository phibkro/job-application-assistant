import { Runtime } from "foldkit";
import { Model, init, routing, update, view } from "./main.ts";
import { initializeThemePreference } from "./theme.ts";

// Applies the stored appearance preference and subscribes to OS scheme
// changes BEFORE the app mounts, so the first painted frame already carries
// the right palette (WS-0013-r1). Returns the same preference `init`'s
// profile submodel will re-read into state.
initializeThemePreference();

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  routing,
  container: document.getElementById("root"),
});

Runtime.run(application);
