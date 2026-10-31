import { setIcon } from "./icons";

export interface SidebarView {
  id: string;
  icon: string;
  title: string;
  containerEl: HTMLElement;
  /** Wird aufgerufen, wenn der Reiter sichtbar wird (z. B. um Inhalte nachzuladen). */
  onShow?(): void;
}

/**
 * Seitenleiste mit Reitern (Obsidians „Side dock“). Aktiver Reiter und eingeklappter Zustand
 * bleiben pro Vault erhalten.
 */
export class Sidebar {
  private headerEl: HTMLElement;
  private contentEl: HTMLElement;
  private views: SidebarView[] = [];
  private tabs = new Map<string, HTMLElement>();
  private active: SidebarView | null = null;
  /**
   * Auf dem Smartphone liegt die Seitenleiste als Schublade über dem Inhalt. Ihr Auf/Zu-Zustand
   * wird dann nicht gespeichert, damit der Desktop-Zustand desselben Vaults erhalten bleibt.
   */
  overlay = false;
  /** Wird nach jedem Ein- oder Ausklappen aufgerufen. */
  onCollapseChange?: (collapsed: boolean) => void;

  constructor(
    private el: HTMLElement,
    private storageKey: string,
  ) {
    this.headerEl = el.createDiv("workspace-tab-header-container");
    this.contentEl = el.createDiv("workspace-tab-container");
    el.toggleClass("is-collapsed", this.load().collapsed === true);
  }

  private load(): { active?: string; collapsed?: boolean } {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey) ?? "{}");
    } catch {
      return {};
    }
  }

  private save() {
    try {
      const collapsed = this.overlay ? this.load().collapsed : this.isCollapsed();
      localStorage.setItem(this.storageKey, JSON.stringify({ active: this.active?.id, collapsed }));
    } catch {
      // Ohne localStorage geht nur der Zustand über Neuladen hinweg verloren.
    }
  }

  addView(view: SidebarView): void {
    this.views.push(view);
    const tab = this.headerEl.createDiv({
      cls: "clickable-icon workspace-tab-header",
      attr: { "aria-label": view.title, "data-type": view.id },
    });
    setIcon(tab, view.icon);
    tab.addEventListener("click", () => this.activate(view.id));
    this.tabs.set(view.id, tab);
    view.containerEl.addClass("workspace-leaf-content");
    view.containerEl.hide();
    this.contentEl.appendChild(view.containerEl);
    const saved = this.load().active;
    if (!this.active || saved === view.id) this.activate(view.id, false);
  }

  activate(id: string, reveal = true): void {
    const view = this.views.find((v) => v.id === id);
    if (!view) return;
    this.active?.containerEl.hide();
    this.active = view;
    view.containerEl.show();
    for (const [tabId, tab] of this.tabs) tab.toggleClass("is-active", tabId === id);
    if (reveal) this.setCollapsed(false);
    if (!this.isCollapsed()) view.onShow?.();
    this.save();
  }

  isActive(id: string): boolean {
    return this.active?.id === id && !this.isCollapsed();
  }

  isCollapsed(): boolean {
    return this.el.hasClass("is-collapsed");
  }

  setCollapsed(collapsed: boolean): void {
    this.el.toggleClass("is-collapsed", collapsed);
    if (!collapsed) this.active?.onShow?.();
    this.save();
    this.onCollapseChange?.(collapsed);
  }

  /** Gespeicherten Auf/Zu-Zustand wiederherstellen (beim Wechsel vom Smartphone- ins Desktop-Layout). */
  restoreCollapsed(): void {
    this.setCollapsed(this.load().collapsed === true);
  }

  toggle(): void {
    this.setCollapsed(!this.isCollapsed());
  }
}
