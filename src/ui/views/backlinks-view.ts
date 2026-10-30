import type { App } from "../../app/app";
import { parseLinktext } from "../../core/metadata-cache";
import type { TFile } from "../../core/vault";
import { setIcon } from "../icons";
import { Notice } from "../notice";
import { IndexView } from "./index-view";
import { renderSnippet } from "./snippet";

/** Backlinks der aktiven Notiz: verlinkte und (auf Wunsch) nicht verlinkte Erwähnungen. */
export class BacklinksView extends IndexView {
  id = "backlink";
  icon = "links-coming-in";
  title = "Backlinks";
  private showUnlinked = false;

  constructor(app: App) {
    super(app);
    this.containerEl.addClass("backlink-pane");
    app.workspace.on("file-open", () => this.requestRefresh());
    app.metadataCache.on("resolve", () => this.requestRefresh());
    app.metadataCache.on("resolved", () => this.requestRefresh());
  }

  protected async refresh() {
    const file = this.app.workspace.getActiveFile();
    if (!file) return this.empty("Keine Datei geöffnet.");
    if (!this.app.metadataCache.initialized) return this.empty("Indexiere Notizen …");
    this.containerEl.empty();

    const backlinks = this.app.metadataCache.getBacklinksForFile(file);
    const linked = this.section(`Verlinkte Erwähnungen`, backlinks.size);
    if (!backlinks.size) linked.createDiv({ cls: "search-empty-state", text: "Keine Backlinks gefunden." });
    for (const [sourcePath, refs] of [...backlinks].sort(([a], [b]) => a.localeCompare(b))) {
      const source = this.app.vault.getFileByPath(sourcePath);
      if (!source) continue;
      const content = await this.app.vault.cachedRead(source);
      const matches = refs.map((r) => [r.position.start.offset, r.position.end.offset] as [number, number]);
      this.renderFile(linked, source, content, matches, refs.length ? undefined : "in den Eigenschaften");
    }

    const unlinked = this.section("Nicht verlinkte Erwähnungen", null, this.showUnlinked, (open) => {
      this.showUnlinked = open;
      void this.refresh();
    });
    if (this.showUnlinked) await this.renderUnlinked(unlinked, file);
  }

  private section(title: string, count: number | null, open = true, onToggle?: (open: boolean) => void) {
    const el = this.containerEl.createDiv({ cls: ["tree-item", "backlink-section", ...(open ? [] : ["is-collapsed"])] });
    const header = el.createDiv("tree-item-self backlink-section-title is-clickable");
    setIcon(header.createDiv("tree-item-icon collapse-icon"), "chevron-down");
    header.createDiv({ cls: "tree-item-inner", text: title });
    if (count !== null) header.createDiv({ cls: "tree-item-flair", text: String(count) });
    header.addEventListener("click", () => {
      const nowOpen = el.hasClass("is-collapsed");
      el.toggleClass("is-collapsed", !nowOpen);
      onToggle?.(nowOpen);
    });
    return el.createDiv("search-result-container");
  }

  private renderFile(parent: HTMLElement, file: TFile, content: string, matches: [number, number][], note?: string) {
    const el = parent.createDiv("search-result");
    const title = el.createDiv("search-result-file-title is-clickable");
    title.createDiv({ cls: "search-result-file-name", text: file.basename });
    if (note) title.createDiv({ cls: "search-result-note", text: note });
    title.addEventListener("click", (evt) => void this.app.openFileAt(file, undefined, undefined, evt.metaKey || evt.ctrlKey));
    const list = el.createDiv("search-result-file-matches");
    for (const [start, end] of matches) {
      const line = list.createDiv("search-result-file-match is-clickable");
      renderSnippet(line, content, start, matches);
      line.addEventListener("click", (evt) => void this.app.openFileAt(file, start, end, evt.metaKey || evt.ctrlKey));
    }
    return { el, list };
  }

  /** Erwähnungen des Dateinamens als Wort, außerhalb von Links, Code und Frontmatter. */
  private async renderUnlinked(parent: HTMLElement, file: TFile) {
    const name = file.basename;
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "giu");
    let found = 0;
    for (const source of this.app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path))) {
      if (source === file) continue;
      const content = await this.app.vault.cachedRead(source);
      const meta = this.app.metadataCache.getFileCache(source);
      const blocked: [number, number][] = [
        ...[...(meta?.links ?? []), ...(meta?.embeds ?? [])].map((r) => [r.position.start.offset, r.position.end.offset] as [number, number]),
        ...(meta?.frontmatterPosition ? [[0, meta.frontmatterPosition.end.offset] as [number, number]] : []),
        ...codeRanges(content),
      ];
      const matches = [...content.matchAll(pattern)]
        .map((m) => [m.index!, m.index! + m[0].length] as [number, number])
        .filter(([s, e]) => !blocked.some(([a, b]) => s < b && e > a));
      if (!matches.length) continue;
      found += matches.length;
      const { list } = this.renderFile(parent, source, content, matches);
      // „Verlinken“ wie in Obsidian: die Erwähnung durch einen Link ersetzen.
      [...list.children].forEach((line, i) => {
        const [start, end] = matches[i];
        const button = (line as HTMLElement).createEl("button", { cls: "search-result-hover-button", text: "Verlinken" });
        button.addEventListener("click", (evt) => {
          evt.stopPropagation();
          void this.linkMention(source, file, start, end);
        });
      });
    }
    if (!found) parent.createDiv({ cls: "search-empty-state", text: "Keine nicht verlinkten Erwähnungen." });
  }

  private async linkMention(source: TFile, target: TFile, start: number, end: number) {
    let changed = false;
    await this.app.vault.process(source, (text) => {
      const mention = text.slice(start, end);
      if (mention.toLowerCase() !== target.basename.toLowerCase()) return text; // inzwischen geändert
      changed = true;
      const linktext = this.app.metadataCache.fileToLinktext(target, source.path);
      const link = parseLinktext(linktext).path === mention ? `[[${mention}]]` : `[[${linktext}|${mention}]]`;
      return text.slice(0, start) + link + text.slice(end);
    });
    if (!changed) new Notice("Die Stelle hat sich inzwischen geändert.");
  }
}

/** Bereiche von Codeblöcken und Inline-Code (grob, für nicht verlinkte Erwähnungen). */
function codeRanges(content: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const m of content.matchAll(/```[\s\S]*?(```|$)|`[^`\n]+`/g)) ranges.push([m.index!, m.index! + m[0].length]);
  return ranges;
}
