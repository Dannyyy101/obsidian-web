import type { App } from "../../app/app";
import type { SidebarView } from "../sidebar";

const REFRESH_DELAY_MS = 300;

/**
 * Basis für Seitenleisten-Ansichten, die vom Index abhängen: Aktualisierung gebündelt und nur,
 * wenn die Ansicht sichtbar ist – sonst beim nächsten Einblenden.
 */
export abstract class IndexView implements SidebarView {
  abstract id: string;
  abstract icon: string;
  abstract title: string;
  containerEl = createDiv();
  /** Wird von der App gesetzt, sobald die Ansicht in einer Seitenleiste hängt. */
  isVisible: () => boolean = () => true;
  private dirty = true;
  private timer: number | undefined;

  constructor(protected app: App) {}

  protected abstract refresh(): void | Promise<void>;

  requestRefresh(): void {
    this.dirty = true;
    if (!this.isVisible()) return;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.runRefresh(), REFRESH_DELAY_MS);
  }

  onShow(): void {
    if (this.dirty) this.runRefresh();
  }

  private runRefresh() {
    this.dirty = false;
    void this.refresh();
  }

  protected empty(text: string) {
    this.containerEl.empty();
    this.containerEl.createDiv({ cls: "pane-empty", text });
  }
}
