import { EditorSelection, type EditorState, type Line, type SelectionRange } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { Hotkey } from "../core/hotkeys";

/**
 * Formatierungsbefehle wie in Obsidian (`editor:toggle-bold`, `editor:insert-link` …). Jede
 * Funktion arbeitet auf allen Auswahlbereichen und erzeugt einen Undo-Schritt.
 */

const WORD = /[\p{L}\p{N}_]/u;

/** Bereich des Worts an `pos` (auch direkt davor oder dahinter), sonst null. */
function wordAround(state: EditorState, pos: number): { from: number; to: number } | null {
  const line = state.doc.lineAt(pos);
  let from = pos - line.from;
  let to = from;
  while (from > 0 && WORD.test(line.text[from - 1])) from--;
  while (to < line.length && WORD.test(line.text[to])) to++;
  return from === to ? null : { from: line.from + from, to: line.from + to };
}

/**
 * Umschließt die Auswahl mit `marker` oder entfernt ihn wieder. Ohne Auswahl wird das Wort unter
 * dem Cursor formatiert; zwischen Wörtern entsteht ein leeres Paar mit dem Cursor in der Mitte.
 */
export function toggleWrap(view: EditorView, marker: string, closing = marker): boolean {
  const { state } = view;
  const len = marker.length;
  const closeLen = closing.length;
  view.dispatch(
    state.changeByRange((range) => {
      let { from, to } = range;
      // Marker direkt um die Auswahl → entfernen.
      if (state.sliceDoc(from - len, from) === marker && state.sliceDoc(to, to + closeLen) === closing) {
        // Bei `*` nicht in `**fett**` hineinschneiden.
        const bolder = marker === "*" && state.sliceDoc(from - 2, from) === "**" && state.sliceDoc(to, to + 2) === "**";
        if (!bolder || state.sliceDoc(from - 3, from) === "***") {
          return {
            changes: [{ from: from - len, to: from }, { from: to, to: to + closeLen }],
            range: EditorSelection.range(from - len, to - len),
          };
        }
      }
      // Marker in der Auswahl → entfernen.
      const text = state.sliceDoc(from, to);
      if (text.length >= len + closeLen && text.startsWith(marker) && text.endsWith(closing)) {
        return {
          changes: [{ from, to: from + len }, { from: to - closeLen, to }],
          range: EditorSelection.range(from, to - len - closeLen),
        };
      }
      if (range.empty) {
        const word = wordAround(state, from);
        if (word) ({ from, to } = word);
      }
      return {
        changes: [{ from, insert: marker }, { from: to, insert: closing }],
        range: range.empty && from === to ? EditorSelection.cursor(from + len) : EditorSelection.range(from + len, to + len),
      };
    }),
    { userEvent: "input.format" },
  );
  return true;
}

export const toggleBold = (view: EditorView) => toggleWrap(view, "**");
export const toggleItalics = (view: EditorView) => toggleWrap(view, "*");
export const toggleStrikethrough = (view: EditorView) => toggleWrap(view, "~~");
export const toggleHighlight = (view: EditorView) => toggleWrap(view, "==");
export const toggleCode = (view: EditorView) => toggleWrap(view, "`");
export const toggleInlineMath = (view: EditorView) => toggleWrap(view, "$");
export const toggleComment = (view: EditorView) => toggleWrap(view, "%%");

/** `editor:clear-formatting`: Formatierungszeichen aus der Auswahl entfernen. */
export function clearFormatting(view: EditorView): boolean {
  const { state } = view;
  view.dispatch(
    state.changeByRange((range) => {
      const text = state.sliceDoc(range.from, range.to);
      const clean = text.replace(/(\*\*|__|~~|==|%%)(.+?)\1/g, "$2").replace(/([*_`$])(.+?)\1/g, "$2");
      return { changes: { from: range.from, to: range.to, insert: clean }, range: EditorSelection.range(range.from, range.from + clean.length) };
    }),
    { userEvent: "input.format" },
  );
  return true;
}

/** Wandelt jede berührte Zeile um; `fn` liefert den neuen Präfix-Bereich der Zeile. */
function changeLines(view: EditorView, fn: (line: Line) => { from: number; to: number; insert: string } | null) {
  const { state } = view;
  const lines: Line[] = [];
  for (const r of state.selection.ranges) {
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) {
      if (!lines.some((l) => l.number === n)) lines.push(state.doc.line(n));
    }
  }
  const changes = state.changes(lines.map(fn).filter((c) => c !== null));
  // Eine Auswahl umfasst danach auch die neuen Präfixe; ein Cursor bleibt hinter ihnen.
  const selection = EditorSelection.create(
    state.selection.ranges.map((r) =>
      r.empty ? r.map(changes, 1) : EditorSelection.range(changes.mapPos(r.anchor, r.anchor < r.head ? -1 : 1), changes.mapPos(r.head, r.head < r.anchor ? -1 : 1)),
    ),
    state.selection.mainIndex,
  );
  view.dispatch({ changes, selection, userEvent: "input.format" });
  return true;
}

const LIST_PREFIX = /^(\s*)(?:[-*+] \[.\] |[-*+] |\d+[.)] )?/;

/** `editor:set-heading-N` (0 = Text ohne Überschrift); gleiche Ebene erneut entfernt sie. */
export function setHeading(view: EditorView, level: number): boolean {
  return changeLines(view, (line) => {
    const current = /^#{1,6} /.exec(line.text)?.[0] ?? "";
    const target = level && current.trim().length !== level ? `${"#".repeat(level)} ` : "";
    return { from: line.from, to: line.from + current.length, insert: target };
  });
}

/** Zeilenpräfix umschalten: Zitat, Aufzählung, nummerierte Liste, Aufgabe. */
function toggleLinePrefix(view: EditorView, kind: "quote" | "bullet" | "numbered" | "task"): boolean {
  const { state } = view;
  const lines = state.selection.ranges.flatMap((r) => {
    const out = [];
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) out.push(state.doc.line(n));
    return out;
  });
  const matches = (text: string) =>
    kind === "quote" ? /^\s*> ?/.test(text)
    : kind === "bullet" ? /^\s*[-*+] (?!\[.\] )/.test(text)
    : kind === "numbered" ? /^\s*\d+[.)] /.test(text)
    : /^\s*[-*+] \[.\] /.test(text);
  // Wie Obsidian: Haben alle Zeilen das Präfix schon, wird es entfernt, sonst gesetzt.
  const remove = lines.every((l) => matches(l.text));
  let number = 1;
  return changeLines(view, (line) => {
    if (kind === "quote") {
      const quote = /^> ?/.exec(line.text)?.[0] ?? "";
      return remove ? { from: line.from, to: line.from + quote.length, insert: "" } : { from: line.from, to: line.from, insert: "> " };
    }
    const [prefix, indent] = LIST_PREFIX.exec(line.text)!;
    const insert = remove ? "" : kind === "bullet" ? "- " : kind === "numbered" ? `${number++}. ` : "- [ ] ";
    return { from: line.from + indent.length, to: line.from + prefix.length, insert };
  });
}

export const toggleBlockquote = (view: EditorView) => toggleLinePrefix(view, "quote");
export const toggleBulletList = (view: EditorView) => toggleLinePrefix(view, "bullet");
export const toggleNumberedList = (view: EditorView) => toggleLinePrefix(view, "numbered");

/**
 * `editor:toggle-checklist-status` (Cmd/Strg+Enter): Aufgabe abhaken bzw. wieder öffnen; normale
 * Zeilen und Listenpunkte werden zu Aufgaben.
 */
export function toggleChecklistStatus(view: EditorView): boolean {
  return changeLines(view, (line) => {
    const task = /^(\s*[-*+] \[)(.)\] /.exec(line.text);
    if (task) {
      const at = line.from + task[1].length;
      return { from: at, to: at + 1, insert: task[2] === " " ? "x" : " " };
    }
    const [prefix, indent] = LIST_PREFIX.exec(line.text)!;
    const numbered = /^\s*(\d+[.)]) /.exec(line.text);
    return { from: line.from + indent.length, to: line.from + prefix.length, insert: numbered ? `${numbered[1]} [ ] ` : "- [ ] " };
  });
}

/** Text an jeder Auswahl einfügen; `cursor` = Cursorposition innerhalb von `before + after`. */
function wrapSelection(view: EditorView, build: (selected: string, range: SelectionRange) => { text: string; cursor: [number, number] }) {
  const { state } = view;
  view.dispatch(
    state.changeByRange((range) => {
      const { text, cursor } = build(state.sliceDoc(range.from, range.to), range);
      return {
        changes: { from: range.from, to: range.to, insert: text },
        range: EditorSelection.range(range.from + cursor[0], range.from + cursor[1]),
      };
    }),
    { userEvent: "input.format" },
  );
  return true;
}

/** `editor:insert-link` (Cmd/Strg+K): `[Auswahl](|)`, bei einer URL `[|](URL)`. */
export function insertLink(view: EditorView): boolean {
  return wrapSelection(view, (selected) => {
    if (/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(selected)) return { text: `[](${selected})`, cursor: [1, 1] };
    const text = `[${selected}]()`;
    return { text, cursor: selected ? [text.length - 1, text.length - 1] : [1, 1] };
  });
}

/** `editor:insert-wikilink` bzw. `editor:insert-embed`: `[[Auswahl]]` mit dem Cursor darin. */
export function insertWikilink(view: EditorView, embed = false): boolean {
  const open = embed ? "![[" : "[[";
  return wrapSelection(view, (selected) => ({ text: `${open}${selected}]]`, cursor: [open.length, open.length + selected.length] }));
}

/** Block in eigene Zeilen einfügen (Tabelle, Codeblock …); `{cur}` markiert den Cursor, `{sel}` die Auswahl. */
function insertBlock(view: EditorView, template: string): boolean {
  const { state } = view;
  const range = state.selection.main;
  const line = state.doc.lineAt(range.from);
  const before = range.from > line.from && state.sliceDoc(line.from, range.from).trim() ? "\n\n" : "";
  const after = range.to < state.doc.lineAt(range.to).to ? "\n" : "";
  const body = template.replace("{sel}", state.sliceDoc(range.from, range.to));
  const cursor = body.indexOf("{cur}");
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: before + body.replace("{cur}", "") + after },
    selection: { anchor: range.from + before.length + cursor },
    userEvent: "input.format",
  });
  return true;
}

export const insertCodeblock = (view: EditorView) => insertBlock(view, "```{cur}\n{sel}\n```");
export const insertMathBlock = (view: EditorView) => insertBlock(view, "$$\n{cur}{sel}\n$$");
export const insertCallout = (view: EditorView) => insertBlock(view, "> [!note] {cur}\n> {sel}");
export const insertHorizontalRule = (view: EditorView) => insertBlock(view, "---\n{cur}");
export const insertTable = (view: EditorView) => insertBlock(view, "| {cur}{sel} |  |\n| --- | --- |\n|  |  |");

export interface FormattingCommand {
  /** Obsidians Befehls-ID, damit Hotkeys aus `hotkeys.json` greifen. */
  id: string;
  name: string;
  icon: string;
  run: (view: EditorView) => boolean;
  /** Standardkürzel wie in Obsidian. */
  hotkeys?: Hotkey[];
}

export const FORMATTING_COMMANDS: FormattingCommand[] = [
  { id: "editor:toggle-bold", name: "Fett umschalten", icon: "bold", run: toggleBold, hotkeys: [{ modifiers: ["Mod"], key: "B" }] },
  { id: "editor:toggle-italics", name: "Kursiv umschalten", icon: "italic", run: toggleItalics, hotkeys: [{ modifiers: ["Mod"], key: "I" }] },
  { id: "editor:toggle-strikethrough", name: "Durchgestrichen umschalten", icon: "strikethrough", run: toggleStrikethrough },
  { id: "editor:toggle-highlight", name: "Hervorheben umschalten", icon: "highlighter", run: toggleHighlight },
  { id: "editor:toggle-code", name: "Code umschalten", icon: "code", run: toggleCode },
  { id: "editor:toggle-inline-math", name: "Mathe-Formel umschalten", icon: "sigma", run: toggleInlineMath },
  { id: "editor:toggle-comment", name: "Kommentar umschalten", icon: "percent", run: toggleComment, hotkeys: [{ modifiers: ["Mod"], key: "/" }] },
  { id: "editor:clear-formatting", name: "Formatierung entfernen", icon: "eraser", run: clearFormatting },
  { id: "editor:insert-link", name: "Markdown-Link einfügen", icon: "link", run: insertLink, hotkeys: [{ modifiers: ["Mod"], key: "K" }] },
  { id: "editor:insert-wikilink", name: "Internen Link einfügen", icon: "link-2", run: (v) => insertWikilink(v) },
  { id: "editor:insert-embed", name: "Einbettung einfügen", icon: "file-input", run: (v) => insertWikilink(v, true) },
  { id: "editor:toggle-bullet-list", name: "Aufzählung umschalten", icon: "list", run: toggleBulletList },
  { id: "editor:toggle-numbered-list", name: "Nummerierte Liste umschalten", icon: "list-ordered", run: toggleNumberedList },
  { id: "editor:toggle-checklist-status", name: "Aufgabe abhaken/umwandeln", icon: "list-checks", run: toggleChecklistStatus, hotkeys: [{ modifiers: ["Mod"], key: "Enter" }] },
  { id: "editor:toggle-blockquote", name: "Zitat umschalten", icon: "quote", run: toggleBlockquote },
  ...[0, 1, 2, 3, 4, 5, 6].map((level) => ({
    id: `editor:set-heading-${level}`,
    name: level ? `Überschrift ${level}` : "Keine Überschrift",
    icon: level ? `heading-${level}` : "pilcrow",
    run: (v: EditorView) => setHeading(v, level),
  })),
  { id: "editor:insert-callout", name: "Callout einfügen", icon: "quote", run: insertCallout },
  { id: "editor:insert-codeblock", name: "Codeblock einfügen", icon: "square-code", run: insertCodeblock },
  { id: "editor:insert-mathblock", name: "Formelblock einfügen", icon: "sigma-square", run: insertMathBlock },
  { id: "editor:insert-horizontal-rule", name: "Trennlinie einfügen", icon: "minus", run: insertHorizontalRule },
  { id: "editor:insert-table", name: "Tabelle einfügen", icon: "table", run: insertTable },
];

export function formattingCommand(id: string): FormattingCommand {
  return FORMATTING_COMMANDS.find((c) => c.id === id)!;
}
