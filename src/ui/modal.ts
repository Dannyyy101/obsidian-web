import type { App } from "../app/app";
import { Component } from "../core/component";

/** Entspricht Obsidians `Modal`. */
export class Modal extends Component {
  app: App;
  containerEl: HTMLElement;
  modalEl: HTMLElement;
  titleEl: HTMLElement;
  contentEl: HTMLElement;
  shouldRestoreSelection = true;
  private onKeydown = (evt: KeyboardEvent) => {
    if (evt.key === "Escape") {
      evt.preventDefault();
      this.close();
    }
  };

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
  }

  open(): void {
    document.body.appendChild(this.containerEl);
    document.addEventListener("keydown", this.onKeydown);
    this.load();
    this.onOpen();
  }

  close(): void {
    document.removeEventListener("keydown", this.onKeydown);
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
