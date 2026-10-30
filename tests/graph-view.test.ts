// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { App } from "../src/app/app";
import { Vault } from "../src/core/vault";
import { IndexedAdapter } from "../src/storage/indexed-adapter";
import { MemoryBackend, MemoryTimesStore } from "../src/storage/memory-backend";
import { installDomExtensions } from "../src/ui/dom";
import { GRAPH_VIEW_TYPE } from "../src/ui/views/graph-view";

let counter = 0;

async function setup(name = `G${counter++}`, adapter = new IndexedAdapter(name, new MemoryBackend(), new MemoryTimesStore())) {
  if (!(await adapter.exists("A.md"))) {
    await adapter.write("A.md", "[[B]]");
    await adapter.write("B.md", "b");
  }
  const vault = new Vault(adapter);
  await vault.load();
  const root = document.createElement("div");
  document.body.appendChild(root);
  const app = new App(vault, root);
  await app.workspace.restoreLayout();
  return { app, vault, adapter, titles: () => app.workspace.leaves.map((l) => l.getDisplayText()) };
}

describe("Graph-Ansicht", () => {
  beforeAll(() => installDomExtensions());

  it("öffnet den Graphen im leeren Tab und verdrängt keine geöffnete Datei", async () => {
    const { app, vault, titles } = await setup();
    app.commands.executeCommandById("graph:open");
    expect(titles()).toEqual(["Graph"]);
    expect(app.workspace.getActiveFile()).toBeNull();

    await app.openFileAt(vault.getFileByPath("A.md")!, undefined, undefined, true); // wie ein Klick auf einen Knoten
    expect(titles()).toEqual(["Graph", "A"]);
    app.commands.executeCommandById("graph:open"); // vorhandener Graph-Tab wird aktiviert
    expect(titles()).toEqual(["Graph", "A"]);
    expect(app.workspace.activeLeaf?.view?.getViewType()).toBe(GRAPH_VIEW_TYPE);
  });

  it("ersetzt den Graphen, wenn im selben Tab eine Datei geöffnet wird", async () => {
    const { app, vault, titles } = await setup();
    const leaf = app.workspace.openView(GRAPH_VIEW_TYPE)!;
    await leaf.openFile(vault.getFileByPath("B.md")!);
    expect(leaf.view).toBeNull();
    expect(titles()).toEqual(["B"]);
    expect(app.workspace.getActiveFile()?.path).toBe("B.md");
  });

  it("stellt den Graph-Tab nach dem Neuladen wieder her", async () => {
    const adapter = new IndexedAdapter("Reload", new MemoryBackend(), new MemoryTimesStore());
    const first = await setup("Reload", adapter);
    first.app.workspace.openView(GRAPH_VIEW_TYPE);
    const second = await setup("Reload", adapter);
    expect(second.titles()).toEqual(["Graph"]);
  });
});
