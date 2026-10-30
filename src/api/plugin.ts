import type { App } from "../app/app";
import type { Command } from "../core/commands";
import { Component } from "../core/component";
import type { SettingTab } from "../ui/settings-modal";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
  description: string;
  author: string;
  authorUrl?: string;
  fundingUrl?: string | Record<string, string>;
  isDesktopOnly?: boolean;
  dir?: string;
}

export type ObsidianProtocolData = { action: string } & Record<string, string>;
export type ObsidianProtocolHandler = (params: ObsidianProtocolData) => unknown;

/** Entspricht Obsidians `Plugin`. Alles, was ein Plugin registriert, wird bei `unload` entfernt. */
export class Plugin extends Component {
  app: App;
  manifest: PluginManifest;

  constructor(app: App, manifest: PluginManifest) {
    super();
    this.app = app;
    this.manifest = manifest;
  }

  addRibbonIcon(icon: string, title: string, callback: (evt: MouseEvent) => unknown): HTMLElement {
    const el = this.app.workspace.addRibbonIcon(icon, title, callback);
    this.register(() => el.detach());
    return el;
  }

  addStatusBarItem(): HTMLElement {
    const el = this.app.workspace.addStatusBarItem();
    this.register(() => el.detach());
    return el;
  }

  addCommand(command: Command): Command {
    const full: Command = {
      ...command,
      id: `${this.manifest.id}:${command.id}`,
      name: `${this.manifest.name}: ${command.name}`,
    };
    this.app.commands.addCommand(full);
    this.register(() => this.app.commands.removeCommand(full.id));
    return full;
  }

  removeCommand(commandId: string): void {
    this.app.commands.removeCommand(`${this.manifest.id}:${commandId}`);
  }

  addSettingTab(tab: PluginSettingTab): void {
    this.app.setting.addSettingTab(tab);
    this.register(() => this.app.setting.removeSettingTab(tab));
  }

  registerObsidianProtocolHandler(action: string, handler: ObsidianProtocolHandler): void {
    this.app.protocolHandlers.set(action, handler);
    this.register(() => this.app.protocolHandlers.delete(action));
  }

  // Noch ohne Gegenstück in obsidian-web; registrieren ist erlaubt, wirkt aber (noch) nicht.
  registerView(type: string): void {
    console.warn(`[${this.manifest.id}] registerView("${type}") wird noch nicht unterstützt`);
  }
  registerExtensions(): void {}
  registerMarkdownPostProcessor(): void {}
  registerMarkdownCodeBlockProcessor(): void {}
  registerEditorExtension(): void {}
  registerEditorSuggest(): void {}
  registerHoverLinkSource(): void {}

  private get dataPath() {
    return `${this.manifest.dir}/data.json`;
  }

  async loadData(): Promise<any> {
    const adapter = this.app.vault.adapter;
    if (!(await adapter.exists(this.dataPath))) return null;
    return JSON.parse(await adapter.read(this.dataPath));
  }

  async saveData(data: unknown): Promise<void> {
    await this.app.vault.adapter.write(this.dataPath, JSON.stringify(data, null, 2));
  }

  onExternalSettingsChange?(): unknown;
}

/** Entspricht Obsidians `PluginSettingTab`. */
export abstract class PluginSettingTab implements SettingTab {
  app: App;
  plugin: Plugin;
  containerEl: HTMLElement;
  id: string;
  name: string;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.id = plugin.manifest.id;
    this.name = plugin.manifest.name;
    this.containerEl = createDiv("vertical-tab-content");
  }

  abstract display(): void;

  hide(): void {
    this.containerEl.empty();
  }
}
