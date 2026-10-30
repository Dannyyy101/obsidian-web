import type { App } from "../../app/app";
import { parseQuery, type SearchMatch, searchFile } from "../../core/search";
import type { TFile } from "../../core/vault";
import { getAllTags } from "../../markdown/metadata";
import { setIcon } from "../icons";
import { IndexView } from "./index-view";
import { renderSnippet } from "./snippet";

const MAX_FILES = 200;
const MAX_MATCHES_SHOWN = 5;
const YIELD_EVERY = 50;

/** Volltextsuche über alle Notizen (Obsidians Core-Plugin „Suche“). */
export class SearchView extends IndexView {
  id = "search";
  icon = "search";
  title = "Suche";
  private inputEl: HTMLInputElement;
  private summaryEl: HTMLElement;
  private resultsEl: HTMLElement;
  private runId = 0;
  private inputTimer: number | undefined;

  constructor(app: App) {
    super(app);
    this.containerEl.addClass("search-view");
    const header = this.containerEl.createDiv("search-input-container");
    this.inputEl = header.createEl("input", {
      type: "search",
      placeholder: "Suchen … (file: path: tag: \"Phrase\" -Ausschluss)",
      attr: { spellcheck: "false" },
    });
    this.inputEl.addEventListener("input", () => {
      window.clearTimeout(this.inputTimer);
      this.inputTimer = window.setTimeout(() => void this.refresh(), 250);
    });
    this.summaryEl = this.containerEl.createDiv("search-results-info");
    this.resultsEl = this.containerEl.createDiv("search-results-children");
    // Geänderte Notizen (auch per Sync) aktualisieren laufende Suchen.
    app.metadataCache.on("changed", () => this.inputEl.value.trim() && this.requestRefresh());
    app.vault.on("delete", () => this.inputEl.value.trim() && this.requestRefresh());
    app.vault.on("rename", () => this.inputEl.value.trim() && this.requestRefresh());
  }

  focus(query?: string) {
    if (query !== undefined) {
      this.inputEl.value = query;
      void this.refresh();
    }
    this.inputEl.focus();
    this.inputEl.select();
  }

  protected async refresh() {
    const id = ++this.runId;
    const terms = parseQuery(this.inputEl.value);
    this.resultsEl.empty();
    this.summaryEl.empty();
    if (!terms.length) return;
    this.summaryEl.setText("Suche …");

    const { vault, metadataCache } = this.app;
    const files = vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path));
    const results: { file: TFile; content: string; match: SearchMatch }[] = [];
    for (let i = 0; i < files.length; i++) {
      // Regelmäßig abgeben, damit die Oberfläche bei großen Vaults bedienbar bleibt.
      if (i % YIELD_EVERY === YIELD_EVERY - 1) await new Promise((r) => setTimeout(r, 0));
      if (id !== this.runId) return;
      const file = files[i];
      const content = (await vault.cachedRead(file)).normalize("NFC");
      const meta = metadataCache.getFileCache(file);
      const match = searchFile(terms, {
        path: file.path,
        basename: file.basename,
        content,
        tags: meta ? getAllTags(meta) : [],
      });
      if (match) results.push({ file, content, match });
    }
    if (id !== this.runId) return;

    const total = results.reduce((n, r) => n + r.match.matches.length, 0);
    this.summaryEl.setText(
      results.length ? `${total} Treffer in ${results.length} ${results.length === 1 ? "Datei" : "Dateien"}` : "Keine Treffer.",
    );
    for (const result of results.slice(0, MAX_FILES)) this.renderResult(result);
    if (results.length > MAX_FILES) {
      this.resultsEl.createDiv({ cls: "search-results-more", text: `… und ${results.length - MAX_FILES} weitere Dateien` });
    }
  }

  private renderResult({ file, content, match }: { file: TFile; content: string; match: SearchMatch }) {
    const el = this.resultsEl.createDiv("search-result");
    const title = el.createDiv("search-result-file-title is-clickable");
    const collapse = title.createDiv("collapse-icon");
    setIcon(collapse, "chevron-down");
    title.createDiv({ cls: "search-result-file-name", text: file.basename });
    if (match.matches.length) title.createDiv({ cls: "search-result-count", text: String(match.matches.length) });
    const matchesEl = el.createDiv("search-result-file-matches");
    title.addEventListener("click", (evt) => {
      if ((evt.target as HTMLElement).closest(".collapse-icon")) {
        el.toggleClass("is-collapsed", !el.hasClass("is-collapsed"));
        return;
      }
      void this.app.openFileAt(file, undefined, undefined, evt.metaKey || evt.ctrlKey);
    });

    // Eine Zeile pro Fundstelle; mehrere Treffer in derselben Zeile zusammenfassen.
    const shown = new Set<number>();
    let count = 0;
    for (const [start, end] of match.matches) {
      const lineStart = content.lastIndexOf("\n", start - 1) + 1;
      if (shown.has(lineStart)) continue;
      shown.add(lineStart);
      if (count++ >= MAX_MATCHES_SHOWN) break;
      const line = matchesEl.createDiv("search-result-file-match is-clickable");
      renderSnippet(line, content, start, match.matches);
      line.addEventListener("click", (evt) => void this.app.openFileAt(file, start, end, evt.metaKey || evt.ctrlKey));
    }
    const lines = new Set(match.matches.map(([s]) => content.lastIndexOf("\n", s - 1) + 1)).size;
    if (lines > MAX_MATCHES_SHOWN) {
      matchesEl.createDiv({ cls: "search-result-more", text: `… ${lines - MAX_MATCHES_SHOWN} weitere Stellen` });
    }
  }
}
