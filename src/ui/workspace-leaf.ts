import type { App } from "../app/app";
import type { TFile } from "../core/vault";
import { MarkdownEditor } from "../editor/markdown-editor";
import { Events } from "../shared/events";
import { setIcon } from "./icons";
import { MarkdownView } from "./markdown-view";

let nextId = 0;

/**
 * Ansicht in einem Tab anstelle des Editors (z. B. der Graph), wie Obsidians `View` mit
 * `getViewType`. Öffnet der Tab danach eine Datei, wird die Ansicht geschlossen.
 */
export interface LeafView {
  containerEl: HTMLElement;
  getViewType(): string;
  getDisplayText(): string;
  getIcon(): string;
  /** Tab wird sichtbar bzw. verborgen. */
  onShow?(): void;
  onClose(): void;
}

/**
 * Entspricht Obsidians `WorkspaceLeaf`: ein Tab mit eigener Ansicht. Jeder Tab hat einen eigenen
 * Editor – Undo-Verlauf, Scrollposition und Lese-/Bearbeitungsmodus bleiben pro Tab erhalten.
 */
export class WorkspaceLeaf extends Events {
  readonly id = `leaf-${nextId++}`;
  editor: MarkdownEditor;
  /** @internal Sonderansicht statt des Editors (z. B. Graph). */
  customView: LeafView | null = null;
  private markdownView: MarkdownView;
  tabHeaderEl: HTMLElement;
  private titleEl: HTMLElement;
  private iconEl: HTMLElement;
  private active = false;

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
    this.iconEl = inner.createDiv("workspace-tab-header-inner-icon");
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
      if (file && this.customView) this.setView(null);
      this.updateHeader();
      this.onFile(this, file);
    });
    this.markdownView = new MarkdownView(this, app, this.editor);
    this.updateHeader();
  }

  /** Wie in Obsidian: die Sonderansicht, sonst die `MarkdownView`, solange eine Datei offen ist. */
  get view(): LeafView | MarkdownView | null {
    return this.customView ?? (this.editor.getFile() ? this.markdownView : null);
  }

  /** Entspricht Obsidians `getViewState` (ohne Anheften: `pinned` gibt es noch nicht). */
  getViewState(): { type: string; state: Record<string, unknown>; active?: boolean; pinned?: boolean } {
    if (this.customView) return { type: this.customView.getViewType(), state: {}, active: this.active };
    const file = this.editor.getFile();
    if (!file) return { type: "empty", state: {}, active: this.active };
    return { type: "markdown", state: { file: file.path, mode: this.markdownView.getMode() }, active: this.active, pinned: false };
  }

  getFile(): TFile | null {
    return this.customView ? null : this.editor.getFile();
  }

  getDisplayText(): string {
    return this.customView?.getDisplayText() ?? this.getFile()?.basename ?? "Neuer Tab";
  }

  /** Zeigt `view` statt des Editors; `null` kehrt zum Editor zurück. */
  setView(view: LeafView | null): void {
    if (this.customView === view) return;
    this.customView?.onClose();
    this.customView?.containerEl.detach();
    this.customView = view;
    if (view) this.editor.containerEl.parentElement?.appendChild(view.containerEl);
    this.setActive(this.active);
    this.updateHeader();
    this.onFile(this, this.getFile());
  }

  private updateHeader() {
    const text = this.getDisplayText();
    this.titleEl.setText(text);
    setIcon(this.iconEl, this.customView?.getIcon() ?? "file-text");
    this.tabHeaderEl.setAttr("aria-label", this.getFile()?.path ?? text);
  }

  setActive(active: boolean) {
    this.active = active;
    this.tabHeaderEl.toggleClass("is-active", active);
    this.editor.containerEl.toggle(active && !this.customView);
    if (this.customView) {
      this.customView.containerEl.toggle(active);
      if (active) this.customView.onShow?.();
    }
  }

  /** `active: true` macht den Tab zusätzlich zum aktiven (wie Obsidians `OpenViewState.active`). */
  async openFile(file: TFile, openState?: { active?: boolean }): Promise<void> {
    await this.editor.openFile(file);
    if (openState?.active) this.onActivate(this);
  }

  async detach(): Promise<void> {
    this.customView?.onClose();
    this.customView?.containerEl.detach();
    await this.editor.destroy();
    this.tabHeaderEl.detach();
  }
}
