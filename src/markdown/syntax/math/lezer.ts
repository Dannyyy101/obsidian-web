import type { BlockContext, InlineContext, Line, MarkdownConfig } from "@lezer/markdown";
import { tags } from "@lezer/highlight";

const DOLLAR = 36; // $
const BACKSLASH = 92; // \

function isSpace(ch: number) {
  return ch === 32 || ch === 9 || ch === 10 || ch === 13;
}

function isDigit(ch: number) {
  return ch >= 48 && ch <= 57;
}

/** Position des schließenden `$`/`$$` ab `from`, oder -1. Escapes (`\$`) werden übersprungen. */
function findClose(cx: InlineContext, from: number, double: boolean): number {
  for (let pos = from; pos < cx.end; pos++) {
    const ch = cx.char(pos);
    if (ch === BACKSLASH) {
      pos++;
      continue;
    }
    if (!double && ch === 10) return -1; // `$…$` bleibt in einer Zeile
    if (ch !== DOLLAR) continue;
    if (double) {
      if (cx.char(pos + 1) === DOLLAR) return pos;
      continue;
    }
    // Wie Obsidian/Pandoc: kein Leerraum vor dem schließenden `$`, keine Ziffer danach (`$5 und $6`).
    if (!isSpace(cx.char(pos - 1)) && !isDigit(cx.char(pos + 1))) return pos;
  }
  return -1;
}

function parseInlineMath(cx: InlineContext, next: number, pos: number): number {
  if (next !== DOLLAR) return -1;
  const double = cx.char(pos + 1) === DOLLAR;
  const open = double ? 2 : 1;
  if (!double && (isSpace(cx.char(pos + 1)) || cx.char(pos + 1) === -1)) return -1;
  const close = findClose(cx, pos + open, double);
  if (close < 0 || close === pos + open) return -1;
  const end = close + open;
  return cx.addElement(
    cx.elt("InlineMath", pos, end, [cx.elt("MathMark", pos, pos + open), cx.elt("MathMark", close, end)]),
  );
}

function startsBlockMath(line: Line) {
  return line.text.startsWith("$$", line.pos);
}

/**
 * `$$ … $$` als Block, auch mehrzeilig. Wie in Obsidian reicht `$$` am Zeilenanfang; ohne
 * schließendes `$$` läuft der Block bis zum Dokumentende.
 */
function parseBlockMath(cx: BlockContext, line: Line): boolean {
  if (!startsBlockMath(line)) return false;
  const start = cx.lineStart + line.pos;
  const marks = [cx.elt("MathMark", start, start + 2)];
  let end: number;

  const sameLine = line.text.indexOf("$$", line.pos + 2);
  if (sameLine >= 0) {
    end = cx.lineStart + sameLine + 2;
    marks.push(cx.elt("MathMark", end - 2, end));
    cx.nextLine();
  } else {
    end = cx.lineStart + line.text.length;
    while (cx.nextLine()) {
      const close = line.text.indexOf("$$", line.pos);
      if (close >= 0) {
        end = cx.lineStart + close + 2;
        marks.push(cx.elt("MathMark", end - 2, end));
        cx.nextLine();
        break;
      }
      end = cx.lineStart + line.text.length;
    }
  }
  cx.addElement(cx.elt("BlockMath", start, end, marks));
  return true;
}

/** LaTeX: `$inline$`, `$$display$$` und mehrzeilige `$$`-Blöcke. */
export const Math: MarkdownConfig = {
  defineNodes: [
    { name: "InlineMath", style: tags.special(tags.string) },
    { name: "BlockMath", block: true, style: tags.special(tags.string) },
    { name: "MathMark", style: tags.processingInstruction },
  ],
  parseInline: [{ name: "InlineMath", parse: parseInlineMath, before: "Escape" }],
  parseBlock: [
    {
      name: "BlockMath",
      before: "FencedCode",
      parse: parseBlockMath,
      // `$$` unterbricht einen laufenden Absatz.
      endLeaf: (_cx, line) => startsBlockMath(line),
    },
  ],
};
