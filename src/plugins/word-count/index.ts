import { EditorView } from "@codemirror/view";
import { debounce, MarkdownView, Plugin } from "../../api/obsidian";
import { countWords } from "./count";

const format = (n: number, one: string, many: string) => `${n.toLocaleString("de-DE")} ${n === 1 ? one : many}`;

/**
 * Core-Plugin „Wortzählung“ (`word-count`): Wörter und Zeichen der aktiven Notiz in der
 * Statusleiste, bei einer Auswahl nur die der Auswahl.
 */
export default class WordCountPlugin extends Plugin {
  private statusBarEl!: HTMLElement;

  onload(): void {
    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.addClass("plugin-word-count");
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.refresh()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.refresh()));
    // Nicht während des CodeMirror-Updates rechnen und zeichnen; schnelles Tippen bündeln.
    const refreshLater = debounce(() => this.refresh(), 0);
    this.register(() => refreshLater.cancel());
    this.registerEditorExtension(
      EditorView.updateListener.of((update) => {
        if (update.docChanged || update.selectionSet) refreshLater();
      }),
    );
    this.refresh();
  }

  private refresh(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    this.statusBarEl.toggle(!!view?.file);
    if (!view?.file) return;
    const { editor } = view;
    const selected = view.getMode() === "source" && editor.somethingSelected();
    const text = selected ? editor.listSelections().map((s) => editor.getRange(...ordered(s.anchor, s.head))).join("\n") : editor.getValue();
    const { words, characters } = countWords(text);
    this.statusBarEl.empty();
    this.statusBarEl.createSpan({ cls: "status-bar-item-segment", text: format(words, "Wort", "Wörter") });
    this.statusBarEl.createSpan({ cls: "status-bar-item-segment", text: format(characters, "Zeichen", "Zeichen") });
    this.statusBarEl.toggleClass("mod-selection", selected);
  }
}

function ordered<T extends { line: number; ch: number }>(a: T, b: T): [T, T] {
  return a.line < b.line || (a.line === b.line && a.ch <= b.ch) ? [a, b] : [b, a];
}
