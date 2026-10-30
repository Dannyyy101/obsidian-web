import type { MarkdownConfig } from "@lezer/markdown";
import { tags } from "@lezer/highlight";

const EQUALS = 61; // =
const HighlightDelim = { resolve: "Highlight", mark: "HighlightMark" };
const Punctuation = /[\p{S}\p{P}]/u;

/** `==markiert==`, nach dem Vorbild von GFM-Strikethrough. */
export const Highlight: MarkdownConfig = {
  defineNodes: [{ name: "Highlight" }, { name: "HighlightMark", style: tags.processingInstruction }],
  parseInline: [
    {
      name: "Highlight",
      parse(cx, next, pos) {
        if (next !== EQUALS || cx.char(pos + 1) !== EQUALS || cx.char(pos + 2) === EQUALS) return -1;
        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(pos + 2, pos + 3);
        const sBefore = /\s|^$/.test(before);
        const sAfter = /\s|^$/.test(after);
        const pBefore = Punctuation.test(before);
        const pAfter = Punctuation.test(after);
        return cx.addDelimiter(
          HighlightDelim,
          pos,
          pos + 2,
          !sAfter && (!pAfter || sBefore || pBefore),
          !sBefore && (!pBefore || sAfter || pAfter),
        );
      },
      after: "Emphasis",
    },
  ],
};
