import type { Extension } from "@codemirror/state";
import type { App } from "../app/app";
import type { Command } from "../core/commands";
import { Component } from "../core/component";
import type { Editor } from "../editor/editor";
import { MarkdownView } from "../ui/markdown-view";
import type { SettingTab as SettingTabEntry } from "../ui/settings-modal";

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

/** Obsidians `Command` samt den Varianten, die einen aktiven Markdown-Editor voraussetzen. */
export interface PluginCommand extends Command {
  editorCallback?: (editor: Editor, view: MarkdownView) => unknown;
  editorCheckCallback?: (checking: boolean, editor: Editor, view: MarkdownView) => boolean | void;
}

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

  addCommand(command: PluginCommand): PluginCommand {
    const full: PluginCommand = {
      ...command,
      id: `${this.manifest.id}:${command.id}`,
      name: `${this.manifest.name}: ${command.name}`,
    };
    const { editorCallback, editorCheckCallback } = command;
    if (editorCallback || editorCheckCallback) {
      // Wie in Obsidian nur verfügbar, solange ein Markdown-Editor aktiv ist (nicht im Lesemodus).
      full.checkCallback = (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || view.getMode() !== "source") return false;
        if (editorCheckCallback) return editorCheckCallback(checking, view.editor, view);
        if (!checking) editorCallback!(view.editor, view);
        return true;
      };
    }
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

  /** CodeMirror-Erweiterung für alle Markdown-Editoren. Ein Array darf das Plugin später ändern und mit `workspace.updateOptions()` anwenden. */
  registerEditorExtension(extension: Extension): void {
    this.register(this.app.workspace.registerEditorExtension(extension));
  }

  // Noch ohne Gegenstück in obsidian-web; registrieren ist erlaubt, wirkt aber (noch) nicht.
  registerView(type: string): void {
    console.warn(`[${this.manifest.id}] registerView("${type}") wird noch nicht unterstützt`);
  }
  registerExtensions(): void {}
  registerMarkdownPostProcessor(): void {}
  registerMarkdownCodeBlockProcessor(): void {}
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

/** Entspricht Obsidians `SettingTab`. Plugins nutzen sie auch als bloßen Inhaltsbehälter. */
export abstract class SettingTab {
  app!: App;
  containerEl: HTMLElement = createDiv("vertical-tab-content");

  abstract display(): void;

  hide(): void {
    this.containerEl.empty();
  }
}

/** Entspricht Obsidians `PluginSettingTab`. */
export abstract class PluginSettingTab extends SettingTab implements SettingTabEntry {
  plugin: Plugin;
  id: string;
  name: string;

  constructor(app: App, plugin: Plugin) {
    super();
    this.app = app;
    this.plugin = plugin;
    this.id = plugin.manifest.id;
    this.name = plugin.manifest.name;
  }
}
