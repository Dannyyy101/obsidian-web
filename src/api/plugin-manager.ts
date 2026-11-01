import * as autocomplete from "@codemirror/autocomplete";
import * as commands from "@codemirror/commands";
import * as language from "@codemirror/language";
import * as lint from "@codemirror/lint";
import * as search from "@codemirror/search";
import * as state from "@codemirror/state";
import * as view from "@codemirror/view";
import * as lezerCommon from "@lezer/common";
import * as lezerHighlight from "@lezer/highlight";
import * as lezerLr from "@lezer/lr";
import i18next from "i18next";
import moment from "moment";
import type { App } from "../app/app";
import { Notice } from "../ui/notice";
import * as obsidian from "./obsidian";
import type { Plugin, PluginManifest } from "./plugin";

/** Plugins, die obsidian-web mitliefert und bei Bedarf in den Vault installiert (scripts/fetch-plugins.mjs). */
const BUNDLED_PLUGINS = ["remotely-save"];
const PLUGIN_FILES = ["manifest.json", "main.js", "styles.css"];

/**
 * Module, die Obsidian Plugins per `require` bereitstellt. CodeMirror und Lezer müssen dieselben
 * Instanzen wie im Editor sein, sonst erkennt CodeMirror die Erweiterungen der Plugins nicht.
 */
const MODULES: Record<string, unknown> = {
  obsidian,
  "@codemirror/autocomplete": autocomplete,
  "@codemirror/commands": commands,
  "@codemirror/language": language,
  "@codemirror/lint": lint,
  "@codemirror/search": search,
  "@codemirror/state": state,
  "@codemirror/view": view,
  "@lezer/common": lezerCommon,
  "@lezer/highlight": lezerHighlight,
  "@lezer/lr": lezerLr,
};

function requireShim(name: string): unknown {
  if (name in MODULES) return MODULES[name];
  throw new Error(`Cannot find module '${name}'`);
}

/** Lädt Community-Plugins aus `.obsidian/plugins/<id>/` wie Obsidian (entspricht `app.plugins`). */
export class PluginManager {
  plugins: Record<string, Plugin> = {};
  manifests: Record<string, PluginManifest> = {};

  constructor(private app: App) {
    // Globals, die Obsidian für Plugins bereitstellt. Die Sprache steht wie in Obsidian im localStorage.
    if (!i18next.isInitialized) void i18next.init({ lng: localStorage.getItem("language") || "en", fallbackLng: "en", initAsync: false });
    Object.assign(window, { app, moment, i18next });
    // `App` liegt eine Schicht über api/, deshalb kommt die Klasse erst hier ins Modul `obsidian`.
    MODULES.obsidian = { ...obsidian, App: app.constructor };
  }

  private get pluginsDir() {
    return `${this.app.vault.configDir}/plugins`;
  }

  private get enabledListPath() {
    return `${this.app.vault.configDir}/community-plugins.json`;
  }

  private async readEnabled(): Promise<string[]> {
    const adapter = this.app.vault.adapter;
    if (!(await adapter.exists(this.enabledListPath))) return [];
    try {
      return JSON.parse(await adapter.read(this.enabledListPath));
    } catch {
      return [];
    }
  }

  /**
   * Installiert mitgelieferte Plugins, die im Vault fehlen, und aktiviert sie. Ein bereits
   * vorhandenes Plugin (z. B. per Sync aus dem Desktop-Vault) hat Vorrang.
   */
  async installBundled(): Promise<void> {
    const adapter = this.app.vault.adapter;
    for (const id of BUNDLED_PLUGINS) {
      const dir = `${this.pluginsDir}/${id}`;
      if (await adapter.exists(`${dir}/manifest.json`)) continue;
      try {
        for (const file of PLUGIN_FILES) {
          const res = await fetch(`${import.meta.env.BASE_URL}bundled-plugins/${id}/${file}`);
          if (!res.ok) {
            if (file === "styles.css") continue;
            throw new Error(`${file}: HTTP ${res.status} – wurde \`pnpm fetch-plugins\` ausgeführt?`);
          }
          await adapter.writeBinary(`${dir}/${file}`, await res.arrayBuffer());
        }
        const enabled = await this.readEnabled();
        if (!enabled.includes(id)) {
          await adapter.write(this.enabledListPath, JSON.stringify([...enabled, id], null, 2));
        }
      } catch (err) {
        console.error(err);
        new Notice(`Plugin „${id}“ konnte nicht installiert werden: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  async loadEnabled(): Promise<void> {
    for (const id of await this.readEnabled()) {
      try {
        await this.loadPlugin(id);
      } catch (err) {
        console.error(`Plugin ${id} konnte nicht geladen werden`, err);
        new Notice(`Plugin „${id}“ konnte nicht geladen werden.`);
      }
    }
  }

  async loadPlugin(id: string): Promise<Plugin | null> {
    const adapter = this.app.vault.adapter;
    const dir = `${this.pluginsDir}/${id}`;
    const manifest: PluginManifest = { ...JSON.parse(await adapter.read(`${dir}/manifest.json`)), dir };
    if (manifest.isDesktopOnly) {
      new Notice(`Plugin „${manifest.name}“ läuft nur in der Desktop-App und wurde übersprungen.`);
      return null;
    }
    this.manifests[id] = manifest;

    if (await adapter.exists(`${dir}/styles.css`)) {
      document.head.createEl("style", { attr: { "data-plugin": id }, text: await adapter.read(`${dir}/styles.css`) });
    }

    const code = await adapter.read(`${dir}/main.js`);
    const module = { exports: {} as Record<string, any> };
    new Function("require", "module", "exports", `${code}\n//# sourceURL=plugin:${id}`)(
      requireShim,
      module,
      module.exports,
    );
    const PluginClass = module.exports.default ?? module.exports;
    const plugin: Plugin = new PluginClass(this.app, manifest);
    this.plugins[id] = plugin;
    plugin.load();
    await plugin._loading;
    return plugin;
  }

  getPlugin(id: string): Plugin | null {
    return this.plugins[id] ?? null;
  }
}
