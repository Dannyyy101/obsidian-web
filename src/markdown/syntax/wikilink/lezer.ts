import type { InlineContext, MarkdownConfig } from "@lezer/markdown";
import { tags } from "@lezer/highlight";

const BRACKET = 91; // [
const BANG = 33; // !

/** `[[Ziel#Abschnitt|Alias]]` und `![[Ziel]]` (Embed). Ziel ohne Zeilenumbruch und ohne `]]`. */
function parseLink(cx: InlineContext, start: number, open: number, type: "Wikilink" | "Embed") {
  if (cx.char(open) !== BRACKET || cx.char(open + 1) !== BRACKET) return -1;
  const close = cx.slice(open + 2, cx.end).search(/\]\]|\n/);
  if (close < 0) return -1;
  const innerFrom = open + 2;
  const innerTo = innerFrom + close;
  if (cx.slice(innerTo, innerTo + 2) !== "]]" || innerTo === innerFrom) return -1;
  return cx.addElement(
    cx.elt(type, start, innerTo + 2, [
      cx.elt("WikilinkMark", start, innerFrom),
      cx.elt("WikilinkTarget", innerFrom, innerTo),
      cx.elt("WikilinkMark", innerTo, innerTo + 2),
    ]),
  );
}

export const Wikilink: MarkdownConfig = {
  defineNodes: [
    { name: "Wikilink", style: tags.link },
    { name: "Embed", style: tags.link },
    { name: "WikilinkMark", style: tags.processingInstruction },
    { name: "WikilinkTarget" },
  ],
  parseInline: [
    { name: "Embed", parse: (cx, next, pos) => (next === BANG ? parseLink(cx, pos, pos + 1, "Embed") : -1), before: "Image" },
    { name: "Wikilink", parse: (cx, next, pos) => (next === BRACKET ? parseLink(cx, pos, pos, "Wikilink") : -1), before: "Link" },
  ],
};
