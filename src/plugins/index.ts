import type { App } from "../app/app";
import type { Plugin, PluginManifest } from "../api/plugin";
import WordCountPlugin from "./word-count";

/**
 * Core-Plugins nach Obsidians IDs. Bis sie sich abschalten lassen (`core-plugins.json`), lädt
 * `App` alle beim Start.
 */
export const CORE_PLUGINS: { id: string; name: string; plugin: new (app: App, manifest: PluginManifest) => Plugin }[] = [
  { id: "word-count", name: "Wortzählung", plugin: WordCountPlugin },
];

export function loadCorePlugins(app: App): Plugin[] {
  return CORE_PLUGINS.map(({ id, name, plugin: Ctor }) => {
    const plugin = new Ctor(app, { id, name, version: "", minAppVersion: "", description: "", author: "" });
    plugin.load();
    return plugin;
  });
}
