import type { App } from "../app/app";
import { Component } from "../core/component";
import { Scope } from "./keymap";

/** Entspricht Obsidians `Modal`. */
export class Modal extends Component {
  app: App;
  containerEl: HTMLElement;
  modalEl: HTMLElement;
  titleEl: HTMLElement;
  contentEl: HTMLElement;
  shouldRestoreSelection = true;
  /** Tastenkürzel, solange der Dialog offen ist; Escape schließt ihn. */
  scope = new Scope();

  constructor(app: App) {
    super();
    this.app = app;
    this.containerEl = createDiv("modal-container mod-dim");
    this.containerEl.createDiv("modal-bg").addEventListener("click", () => this.close());
    this.modalEl = this.containerEl.createDiv("modal");
    const close = this.modalEl.createDiv("modal-close-button");
    close.addEventListener("click", () => this.close());
    this.titleEl = this.modalEl.createDiv("modal-title");
    this.contentEl = this.modalEl.createDiv("modal-content");
    this.scope.register([], "Escape", () => {
      this.close();
      return false;
    });
  }

  open(): void {
    document.body.appendChild(this.containerEl);
    this.app.keymap.pushScope(this.scope);
    this.load();
    this.onOpen();
  }

  close(): void {
    this.app.keymap.popScope(this.scope);
    this.containerEl.detach();
    this.unload();
    this.onClose();
  }

  onOpen(): void | Promise<void> {}

  onClose(): void {}

  setTitle(title: string): this {
    this.titleEl.setText(title);
    return this;
  }

  setContent(content: string | DocumentFragment): this {
    this.contentEl.setText(content);
    return this;
  }
}
