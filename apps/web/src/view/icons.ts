import { inertHtml, type Html, type HtmlBuilder } from "foldkit/html";

// The four navigation glyphs (WS-0013-r1), drawn inline so the shell needs
// no icon package. Static `currentColor` paths only — the surrounding token
// utilities decide the colour, and `aria-hidden` on the wrapper keeps these
// decorative marks out of the accessibility tree (the nav item's own label
// carries the meaning).

export type AppIcon = "browse" | "feed" | "bookmark" | "person" | "studio";

const icons: Readonly<Record<AppIcon, string>> = {
  // Magnifier over a document: searching the vacancy corpus.
  browse:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  // Sparkline/pulse: a ranked stream that changes as your profile does.
  feed: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2.5-7 4 14L16 12h5"/></svg>',
  bookmark:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1Z"/></svg>',
  person:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4.5 21c1.2-3.8 4.1-6 7.5-6s6.3 2.2 7.5 6"/></svg>',
  // Document with a pen nib: drafting CVs and letters in the studio.
  studio:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4Z"/><path d="M13 3v5h5"/><path d="m10 17 1.2-3.6a1 1 0 0 1 .24-.4L15 9.5l1.8 1.8-3.5 3.56a1 1 0 0 1-.4.24L10 17Z"/></svg>',
};

/** The icon boundary: product views consume a named glyph without touching
 *  raw markup themselves (same shape of rule the source repo applies to its
 *  Phosphor imports). The wrapper carries no handlers, so the inert builder
 *  is the right tool — icons dispatch nothing. */
export const icon = <Message>(
  name: AppIcon,
  className = "[&_svg]:block [&_svg]:w-full [&_svg]:h-full",
): Html => {
  const h = inertHtml as unknown as HtmlBuilder<Message>;
  return h.span([h.Class(className), h.AriaHidden(true), h.InnerHTML(icons[name])], []);
};
