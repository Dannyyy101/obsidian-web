import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
  search,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import { type Extension, Prec } from "@codemirror/state";
import { EditorView, keymap, type Panel, runScopeHandlers, type ViewUpdate } from "@codemirror/view";
import { setIcon } from "../ui/icons";

/** Obergrenze beim Zählen, damit riesige Dateien beim Tippen nicht stocken. */
const MAX_COUNT = 9999;

const panels = new WeakMap<EditorView, DocumentSearchPanel>();

/**
 * Such- und Ersetzleiste über der Notiz, aufgebaut wie Obsidians `.document-search-container`.
 * Logik (Treffer, Hervorhebung, Ersetzen) kommt aus `@codemirror/search`.
 */
class DocumentSearchPanel implements Panel {
  dom: HTMLElement;
  top = true;
  private searchInput: HTMLInputElement;
  private replaceInput: HTMLInputElement;
  private countEl: HTMLElement;
  private replaceRow: HTMLElement;
  private caseButton: HTMLElement;
  private regexpButton: HTMLElement;
  private query: SearchQuery;

  constructor(private view: EditorView) {
    this.query = getSearchQuery(view.state);
    this.dom = createDiv("document-search-container");
    const searchRow = this.dom.createDiv("document-search");
    this.searchInput = searchRow.createEl("input", {
      type: "search",
      cls: "document-search-input",
      attr: { placeholder: "Suchen …", "main-field": "true", "aria-label": "Suchen" },
    });
    this.countEl = searchRow.createDiv("document-search-count");
    this.caseButton = this.button(searchRow, "case-sensitive", "Groß-/Kleinschreibung beachten", () =>
      this.commit({ caseSensitive: !this.query.caseSensitive }),
    );
    this.regexpButton = this.button(searchRow, "regex", "Regulärer Ausdruck", () => this.commit({ regexp: !this.query.regexp }));
    this.button(searchRow, "arrow-up", "Vorheriger Treffer", () => findPrevious(this.view));
    this.button(searchRow, "arrow-down", "Nächster Treffer", () => findNext(this.view));
    this.button(searchRow, "replace", "Ersetzen ein-/ausblenden", () => this.showReplace(!this.replaceRow.isShown()));
    this.button(searchRow, "x", "Schließen", () => this.close());

    this.replaceRow = this.dom.createDiv("document-replace");
    this.replaceInput = this.replaceRow.createEl("input", {
      type: "text",
      cls: "document-replace-input",
      attr: { placeholder: "Ersetzen …", "aria-label": "Ersetzen durch" },
    });
    for (const [text, run] of [["Ersetzen", replaceNext], ["Alle ersetzen", replaceAll]] as const) {
      const button = this.replaceRow.createEl("button", { cls: "document-replace-button", text });
      // Fokus bleibt im Eingabefeld (Safari fokussiert Knöpfe beim Klick nicht, Escape ginge sonst verloren).
      button.addEventListener("mousedown", (evt) => evt.preventDefault());
      button.addEventListener("click", () => run(this.view));
    }
    this.replaceRow.hide();

    this.searchInput.value = this.query.search;
    this.replaceInput.value = this.query.replace;
    this.searchInput.addEventListener("input", () => this.commit({ search: this.searchInput.value }));
    this.replaceInput.addEventListener("input", () => this.commit({ replace: this.replaceInput.value }));
    this.searchInput.addEventListener("keydown", (evt) => this.onKey(evt, () => (evt.shiftKey ? findPrevious : findNext)(this.view)));
    this.replaceInput.addEventListener("keydown", (evt) => this.onKey(evt, () => (evt.metaKey || evt.ctrlKey ? replaceAll : replaceNext)(this.view)));
    // Escape überall in der Leiste; sonst die Tasten der Suche (F3, Mod-G …) wie im Editor.
    this.dom.addEventListener("keydown", (evt) => {
      if (evt.key === "Escape") {
        evt.preventDefault();
        this.close();
      } else if (runScopeHandlers(this.view, evt, "search-panel")) {
        evt.preventDefault();
      }
    });
    this.updateButtons();
    panels.set(view, this);
  }

  private button(parent: HTMLElement, icon: string, label: string, onClick: () => unknown): HTMLElement {
    const el = parent.createDiv({ cls: "clickable-icon document-search-button", attr: { "aria-label": label } });
    setIcon(el, icon);
    el.addEventListener("mousedown", (evt) => evt.preventDefault());
    el.addEventListener("click", () => onClick());
    return el;
  }

  private onKey(evt: KeyboardEvent, onEnter: () => unknown) {
    if (evt.key !== "Enter") return;
    evt.preventDefault();
    evt.stopPropagation();
    onEnter();
  }

  private commit(change: Partial<ConstructorParameters<typeof SearchQuery>[0]>) {
    const q = this.query;
    const query = new SearchQuery({
      search: q.search,
      replace: q.replace,
      caseSensitive: q.caseSensitive,
      regexp: q.regexp,
      wholeWord: q.wholeWord,
      literal: q.literal,
      ...change,
    });
    if (query.eq(this.query)) return;
    this.query = query;
    this.view.dispatch({ effects: setSearchQuery.of(query) });
  }

  private updateButtons() {
    this.caseButton.toggleClass("is-active", this.query.caseSensitive);
    this.regexpButton.toggleClass("is-active", this.query.regexp);
    this.searchInput.toggleClass("mod-invalid", !!this.query.search && !this.query.valid);
  }

  private updateCount() {
    const { query } = this;
    const state = this.view.state;
    if (!query.search || !query.valid) {
      this.countEl.setText(query.search && !query.valid ? "Ungültig" : "");
      return;
    }
    const main = state.selection.main;
    let total = 0;
    let current = 0;
    const cursor = query.getCursor(state);
    for (let r = cursor.next(); !r.done && total < MAX_COUNT; r = cursor.next()) {
      total++;
      if (r.value.from === main.from && r.value.to === main.to) current = total;
    }
    const suffix = total >= MAX_COUNT ? "+" : "";
    this.countEl.setText(total ? `${current || "–"} / ${total}${suffix}` : "Keine Treffer");
    this.countEl.toggleClass("mod-no-results", !total);
  }

  showReplace(show: boolean) {
    this.replaceRow.toggle(show);
    this.dom.toggleClass("mod-replace-mode", show);
    (show ? this.replaceInput : this.searchInput).focus();
  }

  focus() {
    this.searchInput.focus();
    this.searchInput.select();
  }

  private close() {
    closeSearchPanel(this.view);
    this.view.focus();
  }

  mount() {
    this.updateCount();
  }

  update(update: ViewUpdate) {
    for (const tr of update.transactions) {
      for (const effect of tr.effects) {
        if (effect.is(setSearchQuery) && !effect.value.eq(this.query)) {
          this.query = effect.value;
          this.searchInput.value = this.query.search;
          this.replaceInput.value = this.query.replace;
        }
      }
    }
    this.updateButtons();
    if (update.docChanged || update.selectionSet || update.transactions.some((tr) => tr.effects.some((e) => e.is(setSearchQuery)))) {
      this.updateCount();
    }
  }

  destroy() {
    panels.delete(this.view);
  }
}

/**
 * Öffnet die Suchleiste (`editor:open-search`) bzw. mit Ersetzen (`editor:open-search-replace`).
 * Markierter Text einer Zeile wird zum Suchbegriff.
 */
export function openDocumentSearch(view: EditorView, replace = false): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  openSearchPanel(view);
  const panel = panels.get(view);
  if (!panel) return false;
  if (selected && !selected.includes("\n")) {
    const q = getSearchQuery(view.state);
    view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({ search: selected, replace: q.replace, caseSensitive: q.caseSensitive, regexp: false })),
    });
  }
  panel.showReplace(replace);
  if (!replace) panel.focus();
  return true;
}

export function documentSearch(): Extension {
  return [
    search({ top: true, createPanel: (view) => new DocumentSearchPanel(view) }),
    Prec.high(
      keymap.of([
        { key: "Mod-f", run: (view) => openDocumentSearch(view, false), scope: "editor search-panel" },
        { key: "Mod-Alt-f", run: (view) => openDocumentSearch(view, true), scope: "editor search-panel" },
        { key: "Mod-h", run: (view) => openDocumentSearch(view, true), scope: "editor search-panel" },
      ]),
    ),
  ];
}
