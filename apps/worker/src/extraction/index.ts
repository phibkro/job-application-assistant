import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { extractText as extractPdfText } from "unpdf";
import type { UnsupportedDocument } from "../services/Extraction.ts";
import { Extraction } from "../services/Extraction.ts";

/**
 * Transient text extraction for the profile-import route.
 *
 * `text/plain` passes through untouched. `application/pdf` base64-decodes
 * the request payload and runs `unpdf`'s serverless `extractText` — the
 * binding WS-0015 §4 S1's empirical probe confirmed (unpdf@1.8.1 under Bun:
 * clean text, order preserved, serverless-native, browser-target safe).
 * Everything here is request-scoped: the decoded bytes and the extracted
 * string live inside this one Effect and are garbage when it returns.
 */

/** CV-scale documents, not books: a 512 KiB PDF is generous. */
const MAX_BYTES = 512 * 1024;
const MAX_TEXT_CHARS = 200_000;

export const INVALID_PDF_BASE64_REASON = "request body is not valid base64";
export const PDF_TOO_LARGE_REASON = `pdf exceeds the ${MAX_BYTES}-byte decoded size bound`;
export const PDF_PARSE_FAILURE_REASON = "pdf could not be parsed";
export const NO_EXTRACTABLE_PDF_TEXT_REASON =
  "pdf contains no extractable text; OCR is unavailable";

const unsupported = (reason: string): UnsupportedDocument => ({
  _tag: "UnsupportedDocument",
  reason,
});

/**
 * Computes the decoded size without allocating or invoking the decoder.
 * Whitespace follows `atob`; padding must be terminal and structurally valid.
 */
const decodedBase64ByteLength = (content: string): number | undefined => {
  let encodedLength = 0;
  let padding = 0;
  let sawPadding = false;

  for (let index = 0; index < content.length; index++) {
    const code = content.charCodeAt(index);
    if (code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d || code === 0x20) {
      continue;
    }
    if (code === 0x3d) {
      sawPadding = true;
      padding++;
      encodedLength++;
      if (padding > 2) return undefined;
      continue;
    }
    if (
      sawPadding ||
      !(
        (code >= 0x41 && code <= 0x5a) ||
        (code >= 0x61 && code <= 0x7a) ||
        (code >= 0x30 && code <= 0x39) ||
        code === 0x2b ||
        code === 0x2f
      )
    ) {
      return undefined;
    }
    encodedLength++;
  }

  if (encodedLength % 4 === 1) return undefined;
  if (padding > 0 && encodedLength % 4 !== 0) return undefined;
  const dataLength = encodedLength - padding;
  if ((padding === 1 && dataLength % 4 !== 3) || (padding === 2 && dataLength % 4 !== 2)) {
    return undefined;
  }
  return Math.floor((dataLength * 3) / 4);
};

const decodeBase64 = (content: string): Uint8Array<ArrayBuffer> | undefined => {
  try {
    const binary = atob(content);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return undefined;
  }
};

export interface PdfExtractionSeam {
  readonly decodeBase64: (content: string) => Uint8Array<ArrayBuffer> | undefined;
  readonly extractText: (bytes: Uint8Array<ArrayBuffer>) => Promise<string>;
}

export const layerWithPdfSeam = (pdf: PdfExtractionSeam): Layer.Layer<Extraction> =>
  Layer.succeed(Extraction, {
    extract: ({ content, mimeType }) =>
      Effect.suspend(
        (): Effect.Effect<{ sourceKind: "text" | "pdf"; text: string }, UnsupportedDocument> => {
          if (mimeType === "text/plain") {
            return content.length <= MAX_TEXT_CHARS
              ? Effect.succeed({ sourceKind: "text" as const, text: content })
              : Effect.fail(unsupported("plain text exceeds the 200000 character size bound"));
          }
          if (mimeType !== "application/pdf") {
            return Effect.fail(unsupported(`unsupported document type: ${mimeType}`));
          }

          const decodedLength = decodedBase64ByteLength(content);
          if (decodedLength === undefined) {
            return Effect.fail(unsupported(INVALID_PDF_BASE64_REASON));
          }
          if (decodedLength > MAX_BYTES) {
            return Effect.fail(unsupported(PDF_TOO_LARGE_REASON));
          }

          let bytes: Uint8Array<ArrayBuffer> | undefined;
          try {
            bytes = pdf.decodeBase64(content);
          } catch {
            return Effect.fail(unsupported(INVALID_PDF_BASE64_REASON));
          }
          if (bytes === undefined || bytes.byteLength !== decodedLength) {
            return Effect.fail(unsupported(INVALID_PDF_BASE64_REASON));
          }

          return Effect.tryPromise({
            try: () => pdf.extractText(bytes),
            catch: () => unsupported(PDF_PARSE_FAILURE_REASON),
          }).pipe(
            Effect.flatMap((text) =>
              text.trim().length === 0
                ? Effect.fail(unsupported(NO_EXTRACTABLE_PDF_TEXT_REASON))
                : Effect.succeed({ sourceKind: "pdf" as const, text }),
            ),
          );
        },
      ),
  });

export const layer = layerWithPdfSeam({
  decodeBase64,
  extractText: async (bytes) => {
    const result = await extractPdfText(bytes, { mergePages: true });
    return typeof result.text === "string" ? result.text : [...result.text].join("\n");
  },
});
