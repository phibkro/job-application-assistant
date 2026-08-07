import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { decodeEntities, htmlToText } from "./Html.ts";

describe("htmlToText", () => {
  it("matches the recorded NAV advert shape: sections and paragraphs become spaced text", () => {
    const html =
      '<section id="arb-aapningstekst">\n<p>Perfekt Effekt Service AS vokser.</p>\n</section>' +
      '<section id="arb-serEtter"><h2>Hva vi ser etter</h2><p>Du er pålitelig.</p></section>';
    const text = htmlToText(html);
    expect(text).not.toContain("<");
    expect(text).toContain("Perfekt Effekt Service AS vokser.");
    expect(text).toContain("Hva vi ser etter");
  });

  it("never contains an angle bracket, for any tag soup", () => {
    // "&" is excluded from the free-text piece: a literal `&lt;` is a real
    // "<" character the source asked to display, and decoding it back is
    // correct — this property is about tags, not about escaped entities.
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.constantFrom("<p>", "</p>", "<br>", '<div class="x">', "<li>"),
            fc
              .string({ minLength: 0, maxLength: 8 })
              .filter((s) => !s.includes("<") && !s.includes(">") && !s.includes("&")),
          ),
        ),
        (parts) => {
          const text = htmlToText(parts.join(""));
          expect(text).not.toMatch(/[<>]/);
        },
      ),
    );
  });

  it("output never carries leading, trailing, or doubled whitespace", () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        const text = htmlToText(raw);
        expect(text).toBe(text.trim());
        expect(text).not.toMatch(/ {2,}/);
      }),
    );
  });
});

describe("decodeEntities", () => {
  it("round-trips the fixed NAV entity set", () => {
    expect(decodeEntities("Renhold &amp; vask")).toBe("Renhold & vask");
    expect(decodeEntities("&lt;tag&gt;")).toBe("<tag>");
    expect(decodeEntities("&quot;quoted&quot;")).toBe('"quoted"');
    expect(decodeEntities("it&#39;s")).toBe("it's");
  });

  it("decodes any in-range numeric entity to its exact code point", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0x20, max: 0xd7ff }), (codePoint) => {
        const decimal = decodeEntities(`&#${codePoint};`);
        const hex = decodeEntities(`&#x${codePoint.toString(16)};`);
        const expected = String.fromCodePoint(codePoint);
        expect(decimal).toBe(expected);
        expect(hex).toBe(expected);
      }),
    );
  });
});
