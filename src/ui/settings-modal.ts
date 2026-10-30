import type { App } from "../app/app";
import { Modal } from "./modal";

export interface SettingTab {
  id: string;
  name: string;
  containerEl: HTMLElement;
  display(): void;
  hide(): void;
}

/** Entspricht Obsidians Einstellungsdialog (`app.setting`): links Reiter, rechts Inhalt. */
export class SettingsModal extends Modal {
  /** Reiter der App selbst (in Obsidian „Optionen“), vor denen der Plugins. */
  private settingTabs: SettingTab[] = [];
  private tabs: SettingTab[] = [];
  private active: SettingTab | null = null;
  private navEl: HTMLElement;
  private tabContentEl: HTMLElement;

  constructor(app: App) {
    super(app);
    this.modalEl.addClass("mod-settings", "mod-sidebar-layout");
    this.titleEl.detach();
    const container = this.contentEl.createDiv("vertical-tabs-container");
    this.navEl = container.createDiv("vertical-tab-header");
    this.tabContentEl = container.createDiv("vertical-tab-content-container");
  }

  addSettingTab(tab: SettingTab): void {
    this.tabs.push(tab);
  }

  addCoreSettingTab(tab: SettingTab): void {
    this.settingTabs.push(tab);
  }

  removeSettingTab(tab: SettingTab): void {
    this.tabs = this.tabs.filter((t) => t !== tab);
    if (this.active === tab) this.active = null;
  }

  onOpen(): void {
    this.renderNav();
    const tab = this.active ?? this.settingTabs[0] ?? this.tabs[0];
    if (tab) this.openTab(tab);
  }

  onClose(): void {
    this.active?.hide();
  }

  openTabById(id: string): void {
    const tab = [...this.settingTabs, ...this.tabs].find((t) => t.id === id);
    if (!tab) return;
    this.active = tab;
    if (!this.containerEl.isConnected) this.open();
    else this.openTab(tab);
  }

  private renderNav() {
    this.navEl.empty();
    this.renderNavGroup("Optionen", this.settingTabs);
    this.renderNavGroup("Community-Plugins", this.tabs);
  }

  private renderNavGroup(title: string, tabs: SettingTab[]) {
    if (!tabs.length) return;
    const group = this.navEl.createDiv("vertical-tab-header-group");
    group.createDiv({ cls: "vertical-tab-header-group-title", text: title });
    const items = group.createDiv("vertical-tab-header-group-items");
    for (const tab of tabs) {
      const item = items.createDiv({ cls: "vertical-tab-nav-item", text: tab.name, attr: { "data-id": tab.id } });
      item.addEventListener("click", () => this.openTab(tab));
    }
  }

  private openTab(tab: SettingTab) {
    this.active?.hide();
    this.active = tab;
    for (const item of Array.from(this.navEl.querySelectorAll(".vertical-tab-nav-item"))) {
      item.toggleClass("is-active", item.getAttribute("data-id") === tab.id);
    }
    this.tabContentEl.empty();
    this.tabContentEl.appendChild(tab.containerEl);
    tab.display();
  }
}
