import { Runtime } from "foldkit";
import { Model, init, routing, update, view } from "./main.ts";

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  routing,
  container: document.getElementById("root"),
});

Runtime.run(application);
