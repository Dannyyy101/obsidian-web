import type { App } from "../../app/app";
import { parseLinktext } from "../../core/metadata-cache";
import { setIcon } from "../icons";
import { IndexView } from "./index-view";

/** Ausgehende Links der aktiven Notiz, getrennt nach vorhandenen und fehlenden Zielen. */
export class OutgoingLinksView extends IndexView {
  id = "outgoing-link";
  icon = "links-going-out";
  title = "Ausgehende Links";

  constructor(app: App) {
    super(app);
    this.containerEl.addClass("outgoing-link-pane");
    app.workspace.on("file-open", () => this.requestRefresh());
    app.metadataCache.on("resolve", (file) => file === app.workspace.getActiveFile() && this.requestRefresh());
    app.metadataCache.on("resolved", () => this.requestRefresh());
  }

  protected refresh() {
    const file = this.app.workspace.getActiveFile();
    if (!file) return this.empty("Keine Datei geöffnet.");
    const meta = this.app.metadataCache.getFileCache(file);
    if (!meta) return this.empty(this.app.metadataCache.initialized ? "Keine Links." : "Indexiere Notizen …");
    this.containerEl.empty();

    const resolved = new Map<string, number>();
    const unresolved = new Map<string, number>();
    for (const ref of [...(meta.links ?? []), ...(meta.embeds ?? []), ...(meta.frontmatterLinks ?? [])]) {
      const { path } = parseLinktext(ref.link);
      if (!path.trim()) continue;
      const dest = this.app.metadataCache.getFirstLinkpathDest(path, file.path);
      const map = dest ? resolved : unresolved;
      const key = dest ? dest.path : path;
      map.set(key, (map.get(key) ?? 0) + 1);
    }

    this.list("Links", resolved, (path) => {
      const target = this.app.vault.getFileByPath(path);
      if (target) void this.app.openFileAt(target);
    });
    this.list("Fehlende Ziele", unresolved, (link) => void this.app.workspace.openLinkText(link, file.path), true);
  }

  private list(title: string, entries: Map<string, number>, open: (key: string) => void, unresolved = false) {
    const section = this.containerEl.createDiv("tree-item");
    const header = section.createDiv("tree-item-self backlink-section-title");
    header.createDiv({ cls: "tree-item-inner", text: title });
    header.createDiv({ cls: "tree-item-flair", text: String(entries.size) });
    if (!entries.size) section.createDiv({ cls: "search-empty-state", text: "Keine." });
    for (const [key, count] of [...entries].sort(([a], [b]) => a.localeCompare(b))) {
      const item = section.createDiv({ cls: ["tree-item-self", "is-clickable", "outgoing-link-item", ...(unresolved ? ["is-unresolved"] : [])] });
      setIcon(item.createDiv("tree-item-icon"), unresolved ? "file-plus" : "file-text");
      const name = unresolved ? key : key.replace(/\.md$/, "").split("/").pop()!;
      item.createDiv({ cls: "tree-item-inner", text: name, attr: { title: key } });
      if (count > 1) item.createDiv({ cls: "tree-item-flair", text: String(count) });
      item.addEventListener("click", () => open(key));
    }
  }
}
