import { syntaxTree } from "@codemirror/language";
import { type EditorState, type Extension, Prec } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import type { App } from "../../app/app";
import type { TFile } from "../../core/vault";

/** Bereich, den ein Vorschlag ersetzt, und der Text darin. Positionen sind Dokument-Offsets. */
export interface EditorSuggestTriggerInfo {
  start: number;
  end: number;
  query: string;
}

export interface EditorSuggestContext extends EditorSuggestTriggerInfo {
  view: EditorView;
  file: TFile | null;
}

/**
 * Vorschläge beim Tippen, nach dem Vorbild von Obsidians `EditorSuggest`: `onTrigger` erkennt den
 * Auslöser vor dem Cursor, `getSuggestions` liefert die Einträge, `selectSuggestion` fügt den
 * gewählten ein. Statt `Editor` und `EditorPosition` gibt es hier noch den CodeMirror-Zustand und
 * Offsets; mit der `Editor`-Fassade kann `registerEditorSuggest` darauf aufsetzen.
 */
export abstract class EditorSuggest<T> {
  context: EditorSuggestContext | null = null;
  /** Höchstzahl angezeigter Vorschläge. */
  limit = 100;

  constructor(public app: App) {}

  abstract onTrigger(cursor: number, state: EditorState, file: TFile | null): EditorSuggestTriggerInfo | null;
  abstract getSuggestions(context: EditorSuggestContext): T[] | Promise<T[]>;
  abstract renderSuggestion(value: T, el: HTMLElement): void;
  abstract selectSuggestion(value: T, evt: KeyboardEvent | MouseEvent): void;

  /** Ersetzt den Auslösebereich (bis `to`, Standard: Ende des Kontexts) und setzt den Cursor dahinter. */
  protected replace(text: string, to?: number): void {
    const ctx = this.context;
    if (!ctx) return;
    ctx.view.dispatch({
      changes: { from: ctx.start, to: to ?? ctx.end, insert: text },
      selection: { anchor: ctx.start + text.length },
      userEvent: "input.complete",
      scrollIntoView: true,
    });
  }
}

/** Code, Formeln und Kommentare: Dort lösen `[[` und `#` keine Vorschläge aus. */
const NO_SUGGEST = new Set(["InlineCode", "FencedCode", "CodeBlock", "InlineMath", "BlockMath", "ObsidianComment", "HTMLBlock"]);

export function isSuggestBlocked(state: EditorState, pos: number, extra: string[] = []): boolean {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    if (NO_SUGGEST.has(node.name) || extra.includes(node.name)) return true;
  }
  return false;
}

/**
 * Zeigt die Vorschläge des ersten auslösenden `EditorSuggest` unter dem Cursor an. Bedienung wie in
 * Obsidian: Pfeiltasten wählen, Enter/Tab übernimmt, Escape schließt.
 */
export function editorSuggest(suggests: EditorSuggest<unknown>[], getFile: () => TFile | null): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      private containerEl: HTMLElement | null = null;
      private active: EditorSuggest<unknown> | null = null;
      private items: unknown[] = [];
      private selected = 0;
      /** Start eines mit Escape geschlossenen Auslösers; bleibt zu, bis der Auslöser verschwindet. */
      private dismissed: number | null = null;
      /** Zählt Anfragen, damit verspätete asynchrone Ergebnisse verworfen werden. */
      private request = 0;
      private onScroll = () => this.position();

      constructor(private view: EditorView) {
        view.scrollDOM.addEventListener("scroll", this.onScroll);
      }

      update(update: ViewUpdate) {
        if (update.focusChanged && !update.view.hasFocus) return this.close();
        if (!update.docChanged && !update.selectionSet) {
          if (update.geometryChanged) this.position();
          return;
        }
        const typed = update.transactions.some((tr) => tr.isUserEvent("input.type") || tr.isUserEvent("delete.backward"));
        // Nur Tippen öffnet die Vorschläge; Cursorbewegungen halten oder schließen sie.
        if (!this.active && !typed) return;
        this.refresh();
      }

      private refresh() {
        const { state } = this.view;
        const range = state.selection.main;
        const file = getFile();
        for (const suggest of range.empty ? suggests : []) {
          const info = suggest.onTrigger(range.head, state, file);
          if (!info) continue;
          if (this.dismissed === info.start) return this.close(false);
          this.dismissed = null;
          this.active = suggest;
          suggest.context = { ...info, view: this.view, file };
          void this.load(suggest);
          return;
        }
        this.dismissed = null;
        this.close();
      }

      private async load(suggest: EditorSuggest<unknown>) {
        const request = ++this.request;
        const result = suggest.getSuggestions(suggest.context!);
        // Synchrone Ergebnisse sofort zeigen, sonst wählt ein schnelles Enter noch die alte Liste.
        const items = Array.isArray(result) ? result : await result;
        if (request !== this.request || this.active !== suggest) return;
        this.items = items.slice(0, suggest.limit);
        this.selected = 0;
        if (!this.items.length) return this.close(false);
        this.render();
      }

      private render() {
        const suggest = this.active!;
        if (!this.containerEl) {
          this.containerEl = document.body.createDiv("suggestion-container");
          // Fokus bleibt im Editor, sonst schließt das Blur-Ereignis die Liste vor dem Klick.
          this.containerEl.addEventListener("mousedown", (evt) => evt.preventDefault());
        }
        this.containerEl.empty();
        const listEl = this.containerEl.createDiv("suggestion");
        this.items.forEach((item, i) => {
          const el = listEl.createDiv({ cls: ["suggestion-item", ...(i === this.selected ? ["is-selected"] : [])] });
          suggest.renderSuggestion(item, el);
          el.addEventListener("mousemove", () => this.select(i));
          el.addEventListener("click", (evt) => this.choose(i, evt));
        });
        this.position();
      }

      private select(i: number) {
        if (i === this.selected || !this.containerEl) return;
        const els = this.containerEl.querySelectorAll(".suggestion-item");
        els[this.selected]?.removeClass("is-selected");
        this.selected = i;
        els[i]?.addClass("is-selected");
        els[i]?.scrollIntoView({ block: "nearest" });
      }

      private choose(i: number, evt: KeyboardEvent | MouseEvent) {
        const suggest = this.active;
        const item = this.items[i];
        if (!suggest || item === undefined) return;
        // `selectSuggestion` braucht den Kontext noch; danach wird er verworfen.
        this.close(false);
        suggest.selectSuggestion(item, evt);
        suggest.context = null;
      }

      private position() {
        const ctx = this.active?.context;
        if (!this.containerEl || !ctx) return;
        this.view.requestMeasure({
          read: (view) => view.coordsAtPos(ctx.start),
          write: (coords) => {
            const el = this.containerEl;
            if (!el || !coords) return;
            const below = window.innerHeight - coords.bottom;
            const height = el.offsetHeight;
            // Unter der Zeile, wenn dort Platz ist, sonst darüber.
            el.style.top = `${below >= height || below >= coords.top ? coords.bottom + 4 : coords.top - height - 4}px`;
            el.style.left = `${Math.max(0, Math.min(coords.left, window.innerWidth - el.offsetWidth))}px`;
          },
        });
      }

      close(resetContext = true) {
        this.request++;
        if (resetContext && this.active) this.active.context = null;
        this.active = null;
        this.items = [];
        this.containerEl?.remove();
        this.containerEl = null;
      }

      /** Tasten, solange die Liste offen ist. */
      onKey(evt: KeyboardEvent): boolean {
        if (!this.containerEl || !this.items.length || evt.isComposing) return false;
        const n = this.items.length;
        if (evt.key === "ArrowDown" || (evt.ctrlKey && evt.key === "n")) this.select((this.selected + 1) % n);
        else if (evt.key === "ArrowUp" || (evt.ctrlKey && evt.key === "p")) this.select((this.selected - 1 + n) % n);
        else if ((evt.key === "Enter" || evt.key === "Tab") && !evt.shiftKey) this.choose(this.selected, evt);
        else if (evt.key === "Escape") {
          this.dismissed = this.active?.context?.start ?? null;
          this.close();
        } else return false;
        evt.preventDefault();
        return true;
      }

      destroy() {
        this.view.scrollDOM.removeEventListener("scroll", this.onScroll);
        this.close();
      }
    },
  );
  return [
    plugin,
    Prec.highest(EditorView.domEventHandlers({ keydown: (evt, view) => view.plugin(plugin)?.onKey(evt) ?? false })),
  ];
}
