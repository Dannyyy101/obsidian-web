import type { MarkdownConfig } from "@lezer/markdown";

const HASH = 35; // #
// Wie Obsidian: Buchstaben (inkl. Unicode), Ziffern, _ - /; nicht ausschließlich Ziffern.
const TAG_BODY = /^[\p{L}\p{N}_\-/]+/u;

/** `#tag` und `#verschachtelt/tag` – nur nach Zeilenanfang oder Leerraum. */
export const Tag: MarkdownConfig = {
  defineNodes: [{ name: "Tag" }, { name: "TagMark" }],
  parseInline: [
    {
      name: "Tag",
      parse(cx, next, pos) {
        if (next !== HASH) return -1;
        if (pos > cx.offset && !/\s/.test(cx.slice(pos - 1, pos))) return -1;
        const body = TAG_BODY.exec(cx.slice(pos + 1, cx.end))?.[0];
        if (!body || /^\d+$/.test(body)) return -1;
        const end = pos + 1 + body.length;
        return cx.addElement(cx.elt("Tag", pos, end, [cx.elt("TagMark", pos, pos + 1)]));
      },
      before: "Emphasis",
    },
  ],
};
