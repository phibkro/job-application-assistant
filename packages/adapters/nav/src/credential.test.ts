import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import {
  makeNavCredential,
  makePrivateNavCredential,
  makePublicNavCredential,
  parsePublicToken,
  PUBLIC_TOKEN_URL,
} from "./credential.ts";

const tokenOne = "header-one.payload-one.signature-one";
const tokenTwo = "header-two.payload-two.signature-two";

const clientOf = (
  respond: (url: string, headers: Headers) => Response | PromiseLike<Response>,
): HttpClient.HttpClient =>
  HttpClient.make((request, url) =>
    Effect.promise(() =>
      Promise.resolve(respond(url.toString(), new Headers(request.headers))).then((response) =>
        HttpClientResponse.fromWeb(request, response),
      ),
    ),
  );

describe("parsePublicToken", () => {
  it("selects and trims the last non-empty line", () => {
    expect(parsePublicToken(`Current token:\n  ${tokenOne}  \n`)).toBe(tokenOne);
    expect(parsePublicToken(`\n${tokenOne}\n\n${tokenTwo}\n`)).toBe(tokenTwo);
  });

  it("requires exactly three non-empty JWT segments", () => {
    expect(parsePublicToken("header.payload")).toBeUndefined();
    expect(parsePublicToken("header..signature")).toBeUndefined();
    expect(parsePublicToken("header.payload.signature.extra")).toBeUndefined();
    expect(parsePublicToken("header.payload/signature")).toBeUndefined();
  });
});

describe("public NavCredential", () => {
  it("fetches one token cold and reuses it for later callers", async () => {
    let tokenFetches = 0;
    const credential = makePublicNavCredential(
      clientOf((url) => {
        expect(url).toBe(PUBLIC_TOKEN_URL);
        tokenFetches += 1;
        return new Response(`description\n${tokenOne}\n`);
      }),
    );

    await expect(Effect.runPromise(credential.get())).resolves.toBe(tokenOne);
    await expect(Effect.runPromise(credential.get())).resolves.toBe(tokenOne);
    expect(tokenFetches).toBe(1);
  });

  it("shares one in-flight acquisition across concurrent cold callers", async () => {
    let tokenFetches = 0;
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const credential = makePublicNavCredential(
      clientOf(async (url) => {
        expect(url).toBe(PUBLIC_TOKEN_URL);
        tokenFetches += 1;
        await blocked;
        return new Response(tokenOne);
      }),
    );

    const first = Effect.runPromise(credential.get());
    const second = Effect.runPromise(credential.get());
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(tokenFetches).toBe(1);
    release?.();
    await expect(Promise.all([first, second])).resolves.toEqual([tokenOne, tokenOne]);
  });

  it("invalidates only the token that caused a 401", async () => {
    let tokenFetches = 0;
    const credential = makePublicNavCredential(
      clientOf(() => {
        tokenFetches += 1;
        return new Response(tokenFetches === 1 ? tokenOne : tokenTwo);
      }),
    );

    await expect(Effect.runPromise(credential.get())).resolves.toBe(tokenOne);
    await Effect.runPromise(credential.invalidate(tokenTwo));
    await expect(Effect.runPromise(credential.get())).resolves.toBe(tokenOne);
    expect(tokenFetches).toBe(1);

    await Effect.runPromise(credential.invalidate(tokenOne));
    await expect(Effect.runPromise(credential.get())).resolves.toBe(tokenTwo);
    expect(tokenFetches).toBe(2);
  });

  it("redacts invalid response text from acquisition failures", async () => {
    const leaked = `${tokenOne}\nnot-a-jwt`;
    const credential = makePublicNavCredential(clientOf(() => new Response(leaked)));
    const exit = await Effect.runPromiseExit(credential.get());

    expect(exit._tag).toBe("Failure");
    expect(JSON.stringify(exit)).not.toContain(leaked);
    expect(JSON.stringify(exit)).not.toContain(tokenOne);
  });
});

describe("private NavCredential", () => {
  it("uses only the supplied runtime token and never reaches public fetch", async () => {
    let publicFetches = 0;
    const privateCredential = makePrivateNavCredential(tokenOne);
    const selected = makeNavCredential(
      clientOf(() => {
        publicFetches += 1;
        return new Response(tokenTwo);
      }),
      ` ${tokenOne} `,
    );

    await expect(Effect.runPromise(privateCredential.get())).resolves.toBe(tokenOne);
    await expect(Effect.runPromise(selected.get())).resolves.toBe(tokenOne);
    await Effect.runPromise(selected.invalidate(tokenOne));
    await expect(Effect.runPromise(selected.get())).resolves.toBe(tokenOne);
    expect(publicFetches).toBe(0);
  });
  it("fails without a private token instead of falling back to public mode", async () => {
    const credential = makePrivateNavCredential("   ");
    const exit = await Effect.runPromiseExit(credential.get());

    expect(exit._tag).toBe("Failure");
    expect(JSON.stringify(exit)).toContain("SourceUnavailable");
  });
});
