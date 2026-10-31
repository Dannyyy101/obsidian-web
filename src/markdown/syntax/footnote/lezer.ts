import type { BlockContext, InlineContext, Line, MarkdownConfig } from "@lezer/markdown";
import { tags } from "@lezer/highlight";

const BRACKET_OPEN = 91; // [
const BRACKET_CLOSE = 93; // ]
const CARET = 94; // ^
const BACKSLASH = 92; // \

const DEFINITION = /^\[\^([^\]\s]+)\]:[ \t]?/;

/** `[^label]` – Verweis auf eine Fußnote. */
function parseReference(cx: InlineContext, next: number, pos: number): number {
  if (next !== BRACKET_OPEN || cx.char(pos + 1) !== CARET) return -1;
  const label = /^[^\]\s]+/.exec(cx.slice(pos + 2, cx.end))?.[0];
  if (!label || cx.char(pos + 2 + label.length) !== BRACKET_CLOSE) return -1;
  const end = pos + 2 + label.length + 1;
  return cx.addElement(
    cx.elt("FootnoteReference", pos, end, [
      cx.elt("FootnoteMark", pos, pos + 2),
      cx.elt("FootnoteLabel", pos + 2, end - 1),
      cx.elt("FootnoteMark", end - 1, end),
    ]),
  );
}

/** `^[Text]` – Inline-Fußnote; Klammern dürfen verschachtelt sein (`^[siehe [[Notiz]]]`). */
function parseInlineFootnote(cx: InlineContext, next: number, pos: number): number {
  if (next !== CARET || cx.char(pos + 1) !== BRACKET_OPEN) return -1;
  let depth = 1;
  let close = -1;
  for (let i = pos + 2; i < cx.end; i++) {
    const ch = cx.char(i);
    if (ch === BACKSLASH) i++;
    else if (ch === BRACKET_OPEN) depth++;
    else if (ch === BRACKET_CLOSE && --depth === 0) {
      close = i;
      break;
    }
  }
  if (close <= pos + 2) return -1;
  return cx.addElement(
    cx.elt("InlineFootnote", pos, close + 1, [
      cx.elt("FootnoteMark", pos, pos + 2),
      ...cx.parser.parseInline(cx.slice(pos + 2, close), pos + 2),
      cx.elt("FootnoteMark", close, close + 1),
    ]),
  );
}

function startsDefinition(line: Line) {
  return DEFINITION.test(line.text.slice(line.pos));
}

/**
 * `[^label]: Text` – Fußnotendefinition. Eingerückte Folgezeilen gehören dazu. Muss vor
 * `LinkReference` laufen, sonst würde `[^1]: Text` als Linkreferenz verschluckt.
 */
function parseDefinition(cx: BlockContext, line: Line): boolean {
  const match = DEFINITION.exec(line.text.slice(line.pos));
  if (!match) return false;
  const start = cx.lineStart + line.pos;
  const labelEnd = start + match[0].indexOf("]:") + 2;
  const children = [
    cx.elt("FootnoteMark", start, start + 2),
    cx.elt("FootnoteLabel", start + 2, labelEnd - 2),
    cx.elt("FootnoteMark", labelEnd - 2, labelEnd),
    ...cx.parser.parseInline(line.text.slice(line.pos + match[0].length), start + match[0].length),
  ];
  let end = cx.lineStart + line.text.length;
  while (cx.nextLine()) {
    if (line.next === -1 || line.indent - line.baseIndent < 2) break;
    children.push(...cx.parser.parseInline(line.text.slice(line.pos), cx.lineStart + line.pos));
    end = cx.lineStart + line.text.length;
  }
  cx.addElement(cx.elt("FootnoteDefinition", start, end, children));
  return true;
}

/** Fußnoten wie in Obsidian: `[^1]`, `[^1]: Definition` und `^[Inline-Fußnote]`. */
export const Footnote: MarkdownConfig = {
  defineNodes: [
    { name: "FootnoteReference", style: tags.link },
    { name: "InlineFootnote" },
    { name: "FootnoteDefinition", block: true },
    { name: "FootnoteLabel", style: tags.labelName },
    { name: "FootnoteMark", style: tags.processingInstruction },
  ],
  parseInline: [
    { name: "FootnoteReference", parse: parseReference, before: "Link" },
    { name: "InlineFootnote", parse: parseInlineFootnote, before: "Link" },
  ],
  parseBlock: [
    {
      name: "FootnoteDefinition",
      before: "LinkReference",
      parse: parseDefinition,
      endLeaf: (_cx, line) => startsDefinition(line),
    },
  ],
};
