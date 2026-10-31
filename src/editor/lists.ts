import { deleteMarkupBackward } from "@codemirror/lang-markdown";
import { indentUnit, syntaxTree } from "@codemirror/language";
import { insertNewlineAndIndent, insertTab } from "@codemirror/commands";
import { type ChangeSpec, EditorSelection, EditorState, type Extension, type Line, Prec, type StateCommand, type Transaction } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

/** Einstellungen aus `.obsidian/app.json`, die das Schreiben in Listen betreffen. */
export interface ListSettings {
  /** `useTab`: Einrücken mit Tabulator statt Leerzeichen (Obsidian: an). */
  useTab: boolean;
  /** `tabSize`: Breite eines Tabulators bzw. Zahl der Leerzeichen (Obsidian: 4). */
  tabSize: number;
  /** `smartIndentList`: Listen beim Enter fortsetzen, Tab rückt den ganzen Punkt ein (Obsidian: an). */
  smartIndentList: boolean;
}

/** Zitatpräfix, Einzug, Marker, Abstand und optionale Checkbox einer Listenzeile. */
const LIST_ITEM = /^((?:[ \t]*>[ \t]?)*)([ \t]*)([-*+]|(\d+)([.)]))([ \t]+)(\[.\][ \t]+)?/;
const QUOTE = /^((?:[ \t]*>[ \t]?)+)/;
/** In diesen Knoten ist `- ` Text und kein Listenmarker. */
const VERBATIM = new Set(["FencedCode", "CodeBlock", "Frontmatter", "BlockMath", "HTMLBlock", "CommentBlock"]);

interface ListItem {
  quote: string;
  indent: string;
  bullet: string;
  number: number | null;
  delimiter: string;
  task: boolean;
  /** Position hinter Marker und Checkbox, ab hier beginnt der Text. */
  textFrom: number;
}

function parseItem(state: EditorState, line: Line): ListItem | null {
  const m = LIST_ITEM.exec(line.text);
  if (!m || isVerbatim(state, line.from)) return null;
  return {
    quote: m[1],
    indent: m[2],
    bullet: m[3],
    number: m[4] ? Number(m[4]) : null,
    delimiter: m[5] ?? "",
    task: !!m[7],
    textFrom: line.from + m[0].length,
  };
}

function isVerbatim(state: EditorState, pos: number): boolean {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    if (VERBATIM.has(node.name)) return true;
  }
  return false;
}

/** Breite eines Einzugs in Spalten (Tabulator = `tabSize`). */
function indentWidth(text: string, tabSize: number): number {
  let width = 0;
  for (const ch of text) width += ch === "\t" ? tabSize - (width % tabSize) : 1;
  return width;
}

/** Einzug ohne Zitatpräfix. */
function lineIndent(text: string): string {
  return /^[ \t]*/.exec(text.slice(QUOTE.exec(text)?.[1].length ?? 0))![0];
}

/** Zeilennummern eines Listenpunkts samt eingerückter Unterpunkte. */
function itemWithChildren(state: EditorState, line: Line): [number, number] {
  const { doc, tabSize } = state;
  const width = indentWidth(lineIndent(line.text), tabSize);
  let last = line.number;
  while (last < doc.lines) {
    const next = doc.line(last + 1).text;
    if (!next.trim() || indentWidth(lineIndent(next), tabSize) <= width) break;
    last++;
  }
  return [line.number, last];
}

/** Nummern der folgenden Geschwister einer nummerierten Liste fortlaufend anpassen. */
function renumberAfter(state: EditorState, lineNo: number, item: ListItem, first: number): ChangeSpec[] {
  const { doc, tabSize } = state;
  const width = indentWidth(item.indent, tabSize);
  const changes: ChangeSpec[] = [];
  let number = first;
  for (let n = lineNo + 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const next = parseItem(state, line);
    const nextWidth = next ? indentWidth(next.indent, tabSize) : indentWidth(lineIndent(line.text), tabSize);
    if (!line.text.trim()) break;
    if (nextWidth > width) continue;
    if (!next || nextWidth < width || next.number === null || next.quote !== item.quote) break;
    if (next.number !== number) {
      const from = line.from + next.quote.length + next.indent.length;
      changes.push({ from, to: from + String(next.number).length, insert: String(number) });
    }
    number++;
  }
  return changes;
}

/**
 * Enter in Listen und Zitaten wie in Obsidian: Der nächste Punkt erhält denselben Marker (Aufgaben
 * eine leere Checkbox, Nummern zählen weiter). Enter auf einem leeren Punkt rückt ihn aus bzw.
 * beendet die Liste.
 */
export const continueList: StateCommand = ({ state, dispatch }) => {
  const unit = state.facet(indentUnit);
  let handled = true;
  const tr = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.head);
    const item = parseItem(state, line);
    if (!range.empty) return fail();
    if (item && range.head >= item.textFrom) {
      const rest = state.doc.sliceString(item.textFrom, line.to);
      if (!rest.trim()) {
        // Leerer Punkt: eine Ebene ausrücken, auf oberster Ebene den Marker entfernen.
        if (item.indent) {
          const from = line.from + item.quote.length;
          const outdented = outdent(item.indent, unit, state.tabSize);
          return {
            changes: { from, to: from + item.indent.length, insert: outdented },
            range: EditorSelection.cursor(range.head - item.indent.length + outdented.length),
          };
        }
        const from = line.from + item.quote.length;
        return { changes: { from, to: line.to, insert: "" }, range: EditorSelection.cursor(from) };
      }
      const number = item.number === null ? null : item.number + 1;
      const marker = number === null ? item.bullet : `${number}${item.delimiter}`;
      const insert = `\n${item.quote}${item.indent}${marker} ${item.task ? "[ ] " : ""}`;
      const moved = state.doc.sliceString(range.head, line.to);
      const changes: ChangeSpec[] = [{ from: range.head, to: line.to, insert: insert + moved.trimStart() }];
      if (number !== null) changes.push(...renumberAfter(state, line.number, item, number + 1));
      return { changes, range: EditorSelection.cursor(range.head + insert.length) };
    }
    const quote = QUOTE.exec(line.text)?.[1];
    if (!quote || range.head < line.from + quote.length || isVerbatim(state, line.from)) return fail();
    if (!line.text.slice(quote.length).trim()) {
      // Leere Zitatzeile beendet das Zitat.
      return { changes: { from: line.from, to: line.to, insert: "" }, range: EditorSelection.cursor(line.from) };
    }
    const insert = `\n${quote.trimEnd()} `;
    return { changes: { from: range.head, insert }, range: EditorSelection.cursor(range.head + insert.length) };

    function fail() {
      handled = false;
      return { range };
    }
  });
  if (!handled) return false;
  dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input" }));
  return true;
};

/** Einzug um eine Einheit verringern (Tabulator oder bis zu `tabSize` Leerzeichen). */
function outdent(indent: string, unit: string, tabSize: number): string {
  const target = Math.max(0, indentWidth(indent, tabSize) - indentWidth(unit, tabSize));
  let result = "";
  for (const ch of indent) {
    if (indentWidth(result + ch, tabSize) > target) break;
    result += ch;
  }
  return result;
}

/** Zeilennummern, die Tab/Shift+Tab verändern: ausgewählte Zeilen, bei Listenpunkten mit Unterpunkten. */
function affectedLines(state: EditorState): number[] {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from);
    let last = state.doc.lineAt(range.to);
    if (!range.empty && range.to === last.from && last.number > first.number) last = state.doc.line(last.number - 1);
    for (let n = first.number; n <= last.number; n++) {
      const line = state.doc.line(n);
      const [from, to] = parseItem(state, line) ? itemWithChildren(state, line) : [n, n];
      for (let k = from; k <= to; k++) lines.add(k);
    }
  }
  return [...lines].sort((a, b) => a - b);
}

function changeIndent(state: EditorState, dispatch: (tr: Transaction) => void, more: boolean): boolean {
  const unit = state.facet(indentUnit);
  const changes: ChangeSpec[] = [];
  for (const n of affectedLines(state)) {
    const line = state.doc.line(n);
    if (!line.text.trim() && more) continue;
    const from = line.from + (QUOTE.exec(line.text)?.[1].length ?? 0);
    const indent = lineIndent(line.text);
    const insert = more ? indent + unit : outdent(indent, unit, state.tabSize);
    if (insert !== indent) changes.push({ from, to: from + indent.length, insert });
  }
  // Auch ohne Änderung abfangen, sonst verlässt der Fokus per Tab den Editor.
  if (!changes.length) return true;
  dispatch(state.update({ changes, userEvent: more ? "input.indent" : "delete.dedent" }));
  return true;
}

/** Tab: Listenpunkte (mit Unterpunkten) und Auswahlen einrücken, sonst Tabulator einfügen. */
export const indentList: StateCommand = ({ state, dispatch }) => {
  const inList = state.selection.ranges.some((r) => !r.empty || parseItem(state, state.doc.lineAt(r.head)));
  if (!inList) return insertTab({ state, dispatch });
  return changeIndent(state, dispatch, true);
};

/** Shift+Tab: Listenpunkte (mit Unterpunkten) und ausgewählte Zeilen ausrücken. */
export const outdentList: StateCommand = ({ state, dispatch }) => changeIndent(state, dispatch, false);

/** Listen fortsetzen und ein-/ausrücken wie in Obsidian, gesteuert über die Einstellungen in `app.json`. */
export function listEditing(settings: ListSettings): Extension {
  const extensions: Extension[] = [
    EditorState.tabSize.of(settings.tabSize),
    indentUnit.of(settings.useTab ? "\t" : " ".repeat(settings.tabSize)),
  ];
  const bindings = [
    { key: "Tab", run: indentList, shift: outdentList },
    { key: "Backspace", run: deleteMarkupBackward },
  ];
  if (settings.smartIndentList) bindings.unshift({ key: "Enter", run: continueList, shift: insertNewlineAndIndent });
  extensions.push(Prec.high(keymap.of(bindings)));
  return extensions;
}
