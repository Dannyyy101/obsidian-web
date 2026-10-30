let container: HTMLElement | null = null;

/** Entspricht Obsidians `Notice`: kurze Meldung oben rechts. Dauer 0 = bleibt bis zum Klick. */
export class Notice {
  noticeEl: HTMLElement;
  messageEl: HTMLElement;
  containerEl: HTMLElement;
  private timer: number | undefined;

  constructor(message: string | DocumentFragment, duration = 5000) {
    container ??= document.body.createDiv("notice-container");
    if (!container.isConnected) document.body.appendChild(container);
    this.containerEl = container;
    this.noticeEl = container.createDiv("notice");
    this.messageEl = this.noticeEl.createDiv("notice-message");
    this.setMessage(message);
    this.noticeEl.addEventListener("click", () => this.hide());
    if (duration > 0) this.timer = window.setTimeout(() => this.hide(), duration);
  }

  setMessage(message: string | DocumentFragment): this {
    this.messageEl.setText(message);
    return this;
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.noticeEl.detach();
  }
}
