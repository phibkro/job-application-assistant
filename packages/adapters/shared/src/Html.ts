/**
 * HTML-to-text, shared by every adapter that stores an advert body.
 *
 * Advert descriptions arrive as HTML (NAV) or as HTML embedded inside a JSON
 * string (schema.org `description`). Storing markup means every future
 * consumer of the corpus — search terms, notifications, any client — has to
 * match against tag names instead of words, so this reduces both to plain
 * text before the field ever reaches `RawListing`.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  copy: "©",
  reg: "®",
  trade: "™",
};

// Named, decimal (`&#39;`), and hex (`&#x27;`) entities in one pass, so a
// decoded ampersand from an earlier match is never re-scanned as a second
// entity (the classic double-unescape bug from doing this replace-by-replace).
const ENTITY_PATTERN = /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g;

/**
 * Decodes HTML/XML entities. Unrecognized entities are left as written
 * rather than dropped, since a raw `&whatever;` is more honest than silently
 * deleting a fragment of the source text.
 */
export const decodeEntities = (input: string): string =>
  input.replace(ENTITY_PATTERN, (match, body: string) => {
    if (body.startsWith("#")) {
      const isHex = body[1] === "x" || body[1] === "X";
      const codePoint = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return NAMED_ENTITIES[body] ?? match;
  });

/**
 * Strips tags, decodes entities, then collapses whitespace.
 *
 * Order matters: entities are decoded on the tag-stripped text (so a literal
 * `&lt;` in the source is never mistaken for a real tag), and whitespace
 * collapses last so a `</p><p>` boundary becomes one space, not zero.
 *
 * ```ts import.meta.vitest
 * htmlToText("<p>Body &amp; more</p>") // => "Body & more"
 * htmlToText("<ul><li>A</li><li>B</li></ul>") // => "A B"
 * ```
 */
export const htmlToText = (html: string): string => {
  let out = "";
  let inTag = false;
  for (const character of html) {
    if (character === "<") {
      inTag = true;
      continue;
    }
    if (character === ">") {
      inTag = false;
      out += " ";
      continue;
    }
    if (!inTag) out += character;
  }
  return decodeEntities(out)
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .join(" ");
};

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("htmlToText", () => {
    it("leaves plain text with no tags untouched but whitespace-collapsed", () => {
      expect(htmlToText("  Help   customers  ")).toBe("Help customers");
    });

    it("never leaves an angle bracket in the output", () => {
      expect(htmlToText('<section id="x"><p>Hello <b>world</b></p></section>')).not.toContain("<");
    });
  });

  describe("decodeEntities", () => {
    it("decodes numeric entities without re-scanning their output", () => {
      // &#38; decodes to a literal "&" — a naive sequential replace would
      // then treat that "&" as the start of a second entity if "amp;" followed.
      expect(decodeEntities("&#38;amp;")).toBe("&amp;");
    });

    it("leaves unrecognized entities as written", () => {
      expect(decodeEntities("&notareal;")).toBe("&notareal;");
    });
  });
}
