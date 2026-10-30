import type { App } from "../app/app";
import type { TFile } from "../core/vault";
import { MarkdownEditor } from "../editor/markdown-editor";
import { Events } from "../shared/events";
import { setIcon } from "./icons";

let nextId = 0;

/**
 * Entspricht Obsidians `WorkspaceLeaf`: ein Tab mit eigener Ansicht. Jeder Tab hat einen eigenen
 * Editor – Undo-Verlauf, Scrollposition und Lese-/Bearbeitungsmodus bleiben pro Tab erhalten.
 */
export class WorkspaceLeaf extends Events {
  readonly id = `leaf-${nextId++}`;
  editor: MarkdownEditor;
  tabHeaderEl: HTMLElement;
  private titleEl: HTMLElement;

  constructor(
    app: App,
    tabBarEl: HTMLElement,
    containerEl: HTMLElement,
    private onActivate: (leaf: WorkspaceLeaf) => void,
    private onClose: (leaf: WorkspaceLeaf) => void,
    private onFile: (leaf: WorkspaceLeaf, file: TFile | null) => void,
  ) {
    super();
    this.tabHeaderEl = tabBarEl.createDiv({ cls: "workspace-tab-header tappable", attr: { draggable: "true", "data-leaf": this.id } });
    const inner = this.tabHeaderEl.createDiv("workspace-tab-header-inner");
    setIcon(inner.createDiv("workspace-tab-header-inner-icon"), "file-text");
    this.titleEl = inner.createDiv("workspace-tab-header-inner-title");
    const close = inner.createDiv({ cls: "workspace-tab-header-inner-close-button", attr: { "aria-label": "Schließen" } });
    setIcon(close, "x");

    this.tabHeaderEl.addEventListener("mousedown", (evt) => {
      if (evt.button === 1) {
        evt.preventDefault(); // Mittelklick schließt, wie in Obsidian
        this.onClose(this);
      } else if (evt.button === 0 && !(evt.target as HTMLElement).closest(".workspace-tab-header-inner-close-button")) {
        this.onActivate(this);
      }
    });
    close.addEventListener("click", (evt) => {
      evt.stopPropagation();
      this.onClose(this);
    });

    this.editor = new MarkdownEditor(containerEl, app, (file) => {
      this.updateHeader();
      this.onFile(this, file);
    });
    this.updateHeader();
  }

  getFile(): TFile | null {
    return this.editor.getFile();
  }

  getDisplayText(): string {
    return this.getFile()?.basename ?? "Neuer Tab";
  }

  private updateHeader() {
    const text = this.getDisplayText();
    this.titleEl.setText(text);
    this.tabHeaderEl.setAttr("aria-label", this.getFile()?.path ?? text);
  }

  setActive(active: boolean) {
    this.tabHeaderEl.toggleClass("is-active", active);
    this.editor.containerEl.toggle(active);
  }

  async openFile(file: TFile): Promise<void> {
    await this.editor.openFile(file);
  }

  async detach(): Promise<void> {
    await this.editor.destroy();
    this.tabHeaderEl.detach();
  }
}
