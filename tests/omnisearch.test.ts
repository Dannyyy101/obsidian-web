// @vitest-environment happy-dom
// Integrationstest: Das unveränderte Omnisearch (Release-Build) indexiert einen obsidian-web-Vault,
// findet Notizen über seine API. Den Suchdialog prüft e2e/omnisearch.e2e.ts: Er rendert Treffer erst,
// wenn ein IntersectionObserver sie sichtbar meldet, und den hat happy-dom nicht.
import "fake-indexeddb/auto";
import { existsSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { App } from "../src/app/app";
import { Vault } from "../src/core/vault";
import { IndexedAdapter } from "../src/storage/indexed-adapter";
import { MemoryBackend, MemoryTimesStore } from "../src/storage/memory-backend";
import { installDomExtensions } from "../src/ui/dom";

const ID = "omnisearch";
const PLUGIN_DIR = `public/bundled-plugins/${ID}`;
const hasPlugin = existsSync(`${PLUGIN_DIR}/main.js`);

const NOTES: Record<string, string> = {
  "Rezepte/Pfannkuchen.md": "---\naliases: [Crêpes]\ntags: [kochen]\n---\n# Pfannkuchen\n\nMehl, Eier und Milch verrühren.\n",
  "Einkauf.md": "- Brot\n- Milch kaufen\n",
  "Archiv/Alt.md": "Milch von gestern\n",
};

interface OmnisearchApi {
  search(query: string): Promise<{ path: string; score: number; matches: { match: string; offset: number }[] }[]>;
  registerOnIndexed(cb: () => void): void;
}

let counter = 0;

async function setup() {
  const adapter = new IndexedAdapter(`OS${counter++}`, new MemoryBackend(), new MemoryTimesStore());
  for (const file of ["manifest.json", "main.js", "styles.css"]) {
    await adapter.write(`.obsidian/plugins/${ID}/${file}`, readFileSync(`${PLUGIN_DIR}/${file}`, "utf8"));
  }
  await adapter.write(".obsidian/community-plugins.json", JSON.stringify([ID]));
  await adapter.write(".obsidian/app.json", JSON.stringify({ userIgnoreFilters: ["Archiv/"] }));
  for (const [path, text] of Object.entries(NOTES)) await adapter.write(path, text);
  const vault = new Vault(adapter);
  await vault.load();
  const root = document.createElement("div");
  document.body.appendChild(root);
  const app = new App(vault, root);
  await app.metadataCache.initialize();
  await app.plugins.loadEnabled();
  await app.workspace.restoreLayout();
  app.workspace.setLayoutReady();
  const api = (globalThis as unknown as { omnisearch: OmnisearchApi }).omnisearch;
  await new Promise<void>((resolve) => api.registerOnIndexed(resolve));
  return { app, vault, api };
}

describe.skipIf(!hasPlugin)("Omnisearch in obsidian-web", () => {
  beforeAll(() => installDomExtensions());

  it("indexiert den Vault und findet Notizen über Text, Alias und Ordner", async () => {
    const { api } = await setup();
    const milch = await api.search("milch");
    expect(milch.map((r) => r.path)).toEqual(expect.arrayContaining(["Rezepte/Pfannkuchen.md", "Einkauf.md", "Archiv/Alt.md"]));
    // Ausgeschlossene Dateien (`userIgnoreFilters`) rutschen nach hinten.
    expect(milch.at(-1)?.path).toBe("Archiv/Alt.md");
    expect((await api.search("crêpes")).map((r) => r.path)).toEqual(["Rezepte/Pfannkuchen.md"]);
  });

  it("bietet die Suche in der Datei nur mit aktivem Editor an", async () => {
    const { app, vault } = await setup();
    expect(app.commands.executeCommandById("omnisearch:show-modal-infile")).toBe(false);
    await app.openFileAt(vault.getFileByPath("Einkauf.md")!);
    expect(app.commands.executeCommandById("omnisearch:show-modal-infile")).toBe(true);
  });
});
