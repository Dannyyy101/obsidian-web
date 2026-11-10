import type { App } from "../../app/app";
import type { EventRef } from "../../shared/events";
import type { TAbstractFile, TFile } from "../../core/vault";
import { resourceUrl } from "../../editor/live-preview/host";
import type { LeafView, WorkspaceLeaf } from "../workspace-leaf";

export const PDF_VIEW_TYPE = "pdf";

/**
 * Zeigt eine PDF-Datei aus dem Vault in einem Tab, wie Obsidians PDF-Ansicht (Ansichtstyp `pdf`).
 * Dargestellt wird sie vom eingebauten PDF-Betrachter des Browsers; `#page=3` springt zu einer Seite.
 */
export class PdfView implements LeafView {
  containerEl: HTMLElement;
  file: TFile | null = null;
  private frameEl: HTMLIFrameElement;
  private url: string | null = null;
  private refs: EventRef[];

  constructor(
    private app: App,
    private leaf: WorkspaceLeaf,
  ) {
    this.containerEl = createDiv({ cls: "workspace-leaf-content", attr: { "data-type": PDF_VIEW_TYPE } });
    const content = this.containerEl.createDiv("view-content");
    this.frameEl = content.createEl("iframe", { cls: "pdf-container", attr: { title: "PDF" } });
    const { vault } = app;
    this.refs = [
      vault.on("modify", (file: TAbstractFile) => file === this.file && void this.load(this.file)),
      vault.on("rename", (file: TAbstractFile) => file === this.file && this.leaf.updateHeader()),
    ];
  }

  getViewType(): string {
    return PDF_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file?.basename ?? "PDF";
  }

  getIcon(): string {
    return "file-text";
  }

  getFile(): TFile | null {
    return this.file;
  }

  /** Lädt `file`; `subpath` wie `#page=3` wird an den Betrachter weitergereicht. */
  async load(file: TFile, subpath = ""): Promise<void> {
    const data = await this.app.vault.readBinary(file);
    this.file = file;
    this.revoke();
    this.url = resourceUrl(data, file.extension);
    this.frameEl.src = this.url + (subpath.startsWith("#") ? subpath : "");
    this.leaf.updateHeader();
  }

  onClose(): void {
    for (const ref of this.refs) this.app.vault.offref(ref);
    this.frameEl.src = "about:blank";
    this.revoke();
  }

  private revoke() {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }
}
