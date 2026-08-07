/**
 * Finds the raw text of every `<script type="application/ld+json">` block in
 * an HTML document.
 *
 * A regex, not a DOM parser: this package has no DOM available (it runs in
 * the worker, not a browser), and a `<script>` block's content is exactly the
 * text between its tags — there is no nesting to get wrong the way there is
 * for the surrounding markup.
 */
const SCRIPT_PATTERN =
  /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;

export const findLdJsonBlocks = (html: string): ReadonlyArray<string> => {
  const blocks: Array<string> = [];
  for (const match of html.matchAll(SCRIPT_PATTERN)) {
    const body = match[1];
    if (body !== undefined) blocks.push(body);
  }
  return blocks;
};

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("findLdJsonBlocks", () => {
    it("finds a block regardless of other attributes or attribute order", () => {
      const html =
        '<html><head><script id="x" type="application/ld+json">{"a":1}</script>' +
        '<script type="application/ld+json" id="y">{"a":2}</script></head></html>';
      const blocks = findLdJsonBlocks(html);
      expect(blocks.map((block) => JSON.parse(block) as unknown)).toEqual([{ a: 1 }, { a: 2 }]);
    });

    it("ignores script blocks of any other type", () => {
      const html = '<script type="application/json">{"a":1}</script>';
      expect(findLdJsonBlocks(html)).toEqual([]);
    });
  });
}
