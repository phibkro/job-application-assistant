import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import type * as Layer from "effect/Layer";
import {
  INVALID_PDF_BASE64_REASON,
  layer,
  layerWithPdfSeam,
  NO_EXTRACTABLE_PDF_TEXT_REASON,
  PDF_PARSE_FAILURE_REASON,
  PDF_TOO_LARGE_REASON,
} from "./index.ts";
import { Extraction } from "../services/Extraction.ts";

/**
 * WS-0016 acceptance (d): the extraction seam accepts text/plain passthrough
 * and a real embedded-text PDF (minimal hand-assembled fixture), and rejects
 * wrong mimes, oversized bodies, and corrupt bytes with UnsupportedDocument —
 * never a crash.
 */

// Minimal valid 1-page PDF whose page text is "Kari Nordmann - Senior Baker".
const PDF_B64 =
  "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA1OSA+PgpzdHJlYW0KQlQgL0YxIDE4IFRmIDcyIDcwMCBUZCAoS2FyaSBOb3JkbWFubiAtIFNlbmlvciBCYWtlcikgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9UeXBlIC9Gb250IC9TdWJ0eXBlIC9UeXBlMSAvQmFzZUZvbnQgL0hlbHZldGljYSA+PgplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDAzNTAgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo0MjAKJSVFT0Y=";

const extract = (content: string, mimeType: string, provided: Layer.Layer<Extraction> = layer) =>
  Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const extraction = yield* Extraction;
        return yield* extraction.extract({ content, mimeType });
      }),
      provided,
    ),
  );

describe("Extraction", () => {
  it("passes text/plain through untouched", async () => {
    const result = await extract("Kari Nordmann\nBaker", "text/plain");
    expect(result).toEqual({ sourceKind: "text", text: "Kari Nordmann\nBaker" });
  });

  it("rejects plain text over the character bound", async () => {
    await expect(extract("x".repeat(200_001), "text/plain")).rejects.toMatchObject({
      _tag: "UnsupportedDocument",
      reason: expect.stringContaining("size bound"),
    });
  });

  it("extracts text from an embedded-text PDF", async () => {
    const result = await extract(PDF_B64, "application/pdf");
    expect(result.sourceKind).toBe("pdf");
    expect(result.text).toContain("Kari Nordmann - Senior Baker");
  });

  it("rejects unsupported MIME types at the extraction boundary", async () => {
    await expect(extract("document", "text/docx")).rejects.toEqual({
      _tag: "UnsupportedDocument",
      reason: "unsupported document type: text/docx",
    });
  });

  it("rejects oversized encoded PDF content before decode or parse", async () => {
    let decoderCalls = 0;
    let parserCalls = 0;
    const guardedLayer = layerWithPdfSeam({
      decodeBase64: () => {
        decoderCalls++;
        return new Uint8Array(0);
      },
      extractText: () => {
        parserCalls++;
        return Promise.resolve("unexpected");
      },
    });

    await expect(
      extract(`${"A".repeat(699_055)}=`, "application/pdf", guardedLayer),
    ).rejects.toEqual({
      _tag: "UnsupportedDocument",
      reason: PDF_TOO_LARGE_REASON,
    });
    expect(decoderCalls).toBe(0);
    expect(parserCalls).toBe(0);
  });

  it("rejects impossible base64 before decode or parse", async () => {
    let decoderCalls = 0;
    let parserCalls = 0;
    const guardedLayer = layerWithPdfSeam({
      decodeBase64: () => {
        decoderCalls++;
        return new Uint8Array(0);
      },
      extractText: () => {
        parserCalls++;
        return Promise.resolve("unexpected");
      },
    });

    await expect(extract("A", "application/pdf", guardedLayer)).rejects.toEqual({
      _tag: "UnsupportedDocument",
      reason: INVALID_PDF_BASE64_REASON,
    });
    expect(decoderCalls).toBe(0);
    expect(parserCalls).toBe(0);
  });

  it("returns stable OCR guidance when a PDF has no extractable text", async () => {
    const noTextLayer = layerWithPdfSeam({
      decodeBase64: () => new Uint8Array(8),
      extractText: () => Promise.resolve(" \n "),
    });

    await expect(extract("JVBERi0xLjQ=", "application/pdf", noTextLayer)).rejects.toEqual({
      _tag: "UnsupportedDocument",
      reason: NO_EXTRACTABLE_PDF_TEXT_REASON,
    });
  });

  it("rejects invalid base64 with a stable typed failure", async () => {
    await expect(extract("not-valid-base64!!!", "application/pdf")).rejects.toEqual({
      _tag: "UnsupportedDocument",
      reason: INVALID_PDF_BASE64_REASON,
    });
  });

  it("rejects corrupt PDF bytes with a stable typed failure", async () => {
    await expect(extract("bm90IGEgcGRm", "application/pdf")).rejects.toEqual({
      _tag: "UnsupportedDocument",
      reason: PDF_PARSE_FAILURE_REASON,
    });
  });
});
