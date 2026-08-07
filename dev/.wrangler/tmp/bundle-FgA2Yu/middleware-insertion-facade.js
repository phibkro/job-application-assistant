				import worker, * as OTHER_EXPORTS from "/srv/share/projects/job-index/.preview/worker.js";
				import * as __MIDDLEWARE_0__ from "/nix/store/wv9s0gb7sqxqfamjfhjy14s6lj6m009v-wrangler-4.93.0/lib/templates/middleware/middleware-ensure-req-body-drained.ts";
import * as __MIDDLEWARE_1__ from "/nix/store/wv9s0gb7sqxqfamjfhjy14s6lj6m009v-wrangler-4.93.0/lib/templates/middleware/middleware-miniflare3-json-error.ts";

				export * from "/srv/share/projects/job-index/.preview/worker.js";
				const MIDDLEWARE_TEST_INJECT = "__INJECT_FOR_TESTING_WRANGLER_MIDDLEWARE__";
				export const __INTERNAL_WRANGLER_MIDDLEWARE__ = [
					
					__MIDDLEWARE_0__.default,__MIDDLEWARE_1__.default
				]
				export default worker;