import type { MarkdownConfig } from "@lezer/markdown";
import { tags } from "@lezer/highlight";

const PERCENT = 37; // %

/** `%%Kommentar%%` innerhalb eines Absatzes. Mehrzeilige Kommentarblöcke folgen später. */
export const Comment: MarkdownConfig = {
  defineNodes: [{ name: "ObsidianComment", style: tags.comment }],
  parseInline: [
    {
      name: "ObsidianComment",
      parse(cx, next, pos) {
        if (next !== PERCENT || cx.char(pos + 1) !== PERCENT) return -1;
        const close = cx.slice(pos + 2, cx.end).indexOf("%%");
        if (close < 0) return -1;
        return cx.addElement(cx.elt("ObsidianComment", pos, pos + 2 + close + 2));
      },
      before: "Emphasis",
    },
  ],
};
