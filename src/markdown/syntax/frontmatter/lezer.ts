import type { MarkdownConfig } from "@lezer/markdown";
import { tags } from "@lezer/highlight";

const FENCE = /^---\s*$/;
const CLOSE = /^(---|\.\.\.)\s*$/;

/**
 * YAML-Frontmatter (Properties) am Dokumentanfang. Ohne diese Erweiterung würde CommonMark
 * `---\ntitle: x\n---` als Setext-Überschrift lesen.
 */
export const Frontmatter: MarkdownConfig = {
  defineNodes: [{ name: "Frontmatter", block: true, style: tags.meta }],
  parseBlock: [
    {
      name: "Frontmatter",
      before: "HorizontalRule",
      parse(cx, line) {
        if (cx.lineStart !== 0 || !FENCE.test(line.text)) return false;
        const start = cx.lineStart;
        let end = start + line.text.length;
        while (cx.nextLine()) {
          end = cx.lineStart + line.text.length;
          if (CLOSE.test(line.text)) {
            cx.nextLine();
            break;
          }
        }
        cx.addElement(cx.elt("Frontmatter", start, end));
        return true;
      },
    },
  ],
};
