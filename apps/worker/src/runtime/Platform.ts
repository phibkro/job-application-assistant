import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Etag from "effect/unstable/http/Etag";
import * as HttpPlatform from "effect/unstable/http/HttpPlatform";

/**
 * The platform services `HttpApiBuilder` asks for, in an environment that has
 * none of them.
 *
 * `HttpApiBuilder` can serve files, so it requires a `FileSystem`, a `Path`,
 * and an `HttpPlatform` built on them. A Worker has no filesystem at all, and
 * this API serves no files — every response is JSON built in memory. So the
 * filesystem is a no-op: reaching for one is a programming error here, and it
 * should fail as one rather than be quietly satisfied by something pretending
 * to have files.
 */
const noFilesystem = FileSystem.layerNoop({});

export const platform = Layer.mergeAll(
  Etag.layer,
  HttpPlatform.layer.pipe(Layer.provideMerge(noFilesystem)),
  Path.layer,
);
