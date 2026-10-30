import type { App } from "../../app/app";
import { IndexView } from "./index-view";

/** Gliederung der aktiven Notiz (Überschriften), Klick springt hin. */
export class OutlineView extends IndexView {
  id = "outline";
  icon = "list";
  title = "Gliederung";

  constructor(app: App) {
    super(app);
    this.containerEl.addClass("outline-pane");
    app.workspace.on("file-open", () => this.requestRefresh());
    app.metadataCache.on("changed", (file) => file === app.workspace.getActiveFile() && this.requestRefresh());
    app.metadataCache.on("resolved", () => this.requestRefresh());
  }

  protected refresh() {
    const file = this.app.workspace.getActiveFile();
    if (!file) return this.empty("Keine Datei geöffnet.");
    const headings = this.app.metadataCache.getFileCache(file)?.headings ?? [];
    if (!headings.length) return this.empty("Keine Überschriften.");
    this.containerEl.empty();
    const minLevel = Math.min(...headings.map((h) => h.level));
    for (const h of headings) {
      const item = this.containerEl.createDiv({ cls: "tree-item-self is-clickable outline-item" });
      item.style.paddingInlineStart = `${(h.level - minLevel) * 16 + 8}px`;
      item.createDiv({ cls: "tree-item-inner", text: h.heading });
      item.addEventListener("click", () => void this.app.openFileAt(file, h.position.start.offset));
    }
  }
}
