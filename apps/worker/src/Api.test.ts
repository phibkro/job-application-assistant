import { describe, expect, it } from "vitest";
import { api } from "./Api.ts";

/**
 * Guards the one thing about this declaration that fails silently.
 *
 * `HttpApiGroup.middleware()` applies to the endpoints a group holds *at that
 * moment* — call it before `.add(...)` and it attaches to nothing, type-checks
 * cleanly, and ships an authenticated API that authenticates nobody. Only
 * inspecting the built value catches that, so this asserts on the built value.
 */

interface BuiltEndpoint {
  readonly identifier: string;
  readonly middlewares: ReadonlySet<{ readonly key: string }>;
}

const endpointsOf = (group: string): ReadonlyArray<BuiltEndpoint> => {
  const groups = (api as unknown as { groups: Record<string, { endpoints: object }> }).groups;
  return Object.values(groups[group]?.endpoints ?? {}) as ReadonlyArray<BuiltEndpoint>;
};

const guards = (endpoint: BuiltEndpoint): ReadonlyArray<string> =>
  Array.from(endpoint.middlewares, (middleware) => middleware.key);

describe("the API's authentication guard", () => {
  it.each(["feed", "profile", "applications"])(
    "covers every endpoint of the %s group, which speaks for a person",
    (group) => {
      const endpoints = endpointsOf(group);
      expect(endpoints.length).toBeGreaterThan(0);
      for (const endpoint of endpoints) {
        expect(guards(endpoint)).toContain("@job-index/Authenticated");
      }
    },
  );

  it("leaves the corpus unguarded, so the catalogue stays readable without an account", () => {
    const endpoints = endpointsOf("corpus");
    expect(endpoints.length).toBeGreaterThan(0);
    for (const endpoint of endpoints) {
      expect(guards(endpoint)).toEqual([]);
    }
  });
});
