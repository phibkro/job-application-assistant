import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

/**
 * Turning a past document into text, transiently.
 *
 * WS-0015 §6 OQ-4: parse, propose, discard. The bytes a person hands the
 * import route exist for exactly one call of `extract` and are garbage the
 * moment it returns — nothing here, and nothing that consumes this tag, has
 * anywhere to put them.
 *
 * A service rather than a function so the parser is swappable behind one
 * seam: `unpdf` covers embedded-text PDFs today (zero egress); the
 * escalation tier for scans and .docx — Firecrawl Parse — waits on an
 * operator data-processor decision (WS-0015 §4 S1) and slots in here without
 * any handler learning which parser ran.
 */
export interface ExtractedText {
  readonly sourceKind: "text" | "pdf";
  readonly text: string;
}

/** The one failure extraction can produce, carried as data for the handler to lift. */
export interface UnsupportedDocument {
  readonly _tag: "UnsupportedDocument";
  readonly reason: string;
}

export class Extraction extends Context.Service<
  Extraction,
  {
    readonly extract: (input: {
      readonly content: string;
      readonly mimeType: string;
    }) => Effect.Effect<ExtractedText, UnsupportedDocument>;
  }
>()("@job-index/Extraction") {}
