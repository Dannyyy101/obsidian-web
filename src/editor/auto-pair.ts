import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { EditorSelection, EditorState, type Extension, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

/** Einstellungen aus `.obsidian/app.json` für automatisch geschlossene Zeichen. */
export interface AutoPairSettings {
  /** `autoPairBrackets`: `()`, `[]`, `{}` paarweise einfügen (Obsidian: an). */
  autoPairBrackets: boolean;
  /** `autoPairMarkdown`: Auswahl mit Formatierungszeichen umschließen, `` ` `` paaren (Obsidian: an). */
  autoPairMarkdown: boolean;
}

/** Zeichen, die eine Auswahl umschließen, statt sie zu ersetzen. */
const MARKDOWN_WRAP = new Set(["*", "_", "~", "=", "`", "$"]);

/** Umschließt jede nicht leere Auswahl mit `char` und lässt den Text ausgewählt (zweimal `*` → fett). */
function wrapSelection(view: EditorView, char: string): boolean {
  const { state } = view;
  if (state.selection.ranges.every((r) => r.empty)) return false;
  view.dispatch(
    state.changeByRange((range) =>
      range.empty
        ? { changes: { from: range.from, insert: char }, range: EditorSelection.cursor(range.from + 1) }
        : {
            changes: [
              { from: range.from, insert: char },
              { from: range.to, insert: char },
            ],
            range: EditorSelection.range(range.anchor + 1, range.head + 1),
          },
    ),
    { userEvent: "input.type", scrollIntoView: true },
  );
  return true;
}

/** Klammern und Markdown-Zeichen paarweise einfügen wie in Obsidian. */
export function autoPair(settings: AutoPairSettings): Extension {
  const brackets = [...(settings.autoPairBrackets ? ["(", "[", "{"] : []), ...(settings.autoPairMarkdown ? ["`"] : [])];
  const extensions: Extension[] = [];
  if (brackets.length) {
    extensions.push(
      // Vorrang vor den Sprachdaten von Markdown, die auch Anführungszeichen paaren würden.
      Prec.highest(EditorState.languageData.of(() => [{ closeBrackets: { brackets } }])),
      closeBrackets(),
      Prec.high(keymap.of(closeBracketsKeymap)),
    );
  }
  if (settings.autoPairMarkdown) {
    extensions.push(
      EditorView.inputHandler.of((view, _from, _to, text) => MARKDOWN_WRAP.has(text) && !brackets.includes(text) && wrapSelection(view, text)),
    );
  }
  return extensions;
}
