// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { App } from "../src/app/app";
import { Vault } from "../src/core/vault";
import { IndexedAdapter } from "../src/storage/indexed-adapter";
import { MemoryBackend, MemoryTimesStore } from "../src/storage/memory-backend";
import { installDomExtensions } from "../src/ui/dom";

let counter = 0;

async function setup(files: Record<string, string> = { "A.md": "a", "B.md": "[[A]]", "C.md": "c" }) {
  const adapter = new IndexedAdapter(`T${counter++}`, new MemoryBackend(), new MemoryTimesStore());
  for (const [path, text] of Object.entries(files)) await adapter.write(path, text);
  const vault = new Vault(adapter);
  await vault.load();
  const root = document.createElement("div");
  document.body.appendChild(root);
  const app = new App(vault, root);
  await app.workspace.restoreLayout();
  const file = (path: string) => vault.getFileByPath(path)!;
  const titles = () => app.workspace.leaves.map((l) => l.getDisplayText());
  return { app, vault, file, titles };
}

describe("Tabs", () => {
  beforeAll(() => installDomExtensions());

  it("startet mit einem leeren Tab und öffnet Dateien im aktiven Tab", async () => {
    const { app, file, titles } = await setup();
    expect(titles()).toEqual(["Neuer Tab"]);
    await app.openFileAt(file("A.md"));
    await app.openFileAt(file("B.md"));
    expect(titles()).toEqual(["B"]);
    expect(app.workspace.getActiveFile()?.path).toBe("B.md");
  });

  it("öffnet neue Tabs rechts neben dem aktiven und meldet den Wechsel", async () => {
    const { app, file, titles } = await setup();
    await app.openFileAt(file("A.md"));
    await app.openFileAt(file("C.md"), undefined, undefined, true);
    app.workspace.setActiveLeaf(app.workspace.leaves[0]);
    await app.openFileAt(file("B.md"), undefined, undefined, true);
    expect(titles()).toEqual(["A", "B", "C"]);

    const opened: (string | null)[] = [];
    app.workspace.on("file-open", (f) => opened.push(f?.path ?? null));
    app.workspace.cycleLeaf(1);
    expect(app.workspace.getActiveFile()?.path).toBe("C.md");
    expect(opened).toEqual(["C.md"]);
  });

  it("jeder Tab hat seinen eigenen Editor", async () => {
    const { app, file } = await setup();
    await app.openFileAt(file("A.md"));
    const first = app.editor;
    await app.openFileAt(file("B.md"), undefined, undefined, true);
    expect(app.editor).not.toBe(first);
    expect(first.getFile()?.path).toBe("A.md");
  });

  it("Schließen aktiviert den linken Nachbarn; der letzte Tab wird zum leeren Tab", async () => {
    const { app, file, titles } = await setup();
    await app.openFileAt(file("A.md"));
    await app.openFileAt(file("B.md"), undefined, undefined, true);
    await app.workspace.closeLeaf(app.workspace.activeLeaf!);
    expect(titles()).toEqual(["A"]);
    expect(app.workspace.getActiveFile()?.path).toBe("A.md");
    await app.workspace.closeLeaf(app.workspace.activeLeaf!);
    expect(titles()).toEqual(["Neuer Tab"]);
    expect(app.workspace.getActiveFile()).toBeNull();
  });

  it("schließt Tabs gelöschter Dateien und benennt Tabs bei Umbenennung um", async () => {
    const { app, vault, file, titles } = await setup();
    await app.openFileAt(file("A.md"));
    await app.openFileAt(file("C.md"), undefined, undefined, true);
    await vault.trash(file("C.md"), true);
    await new Promise((r) => setTimeout(r, 0));
    expect(titles()).toEqual(["A"]);
    await app.fileManager.renameFile(file("A.md"), "Neu.md");
    expect(titles()).toEqual(["Neu"]);
  });

  it("stellt Tabs, aktiven Tab und Lesemodus nach einem Neustart wieder her", async () => {
    const first = await setup();
    await first.app.openFileAt(first.file("A.md"));
    await first.app.openFileAt(first.file("B.md"), undefined, undefined, true);
    await first.app.editor.toggleReadingView();
    first.app.workspace.setActiveLeaf(first.app.workspace.leaves[0]);

    // Gleicher Vault-Name → gleicher localStorage-Schlüssel.
    const root = document.createElement("div");
    const app = new App(first.vault, root);
    await app.workspace.restoreLayout();
    expect(app.workspace.leaves.map((l) => l.getDisplayText())).toEqual(["A", "B"]);
    expect(app.workspace.getActiveFile()?.path).toBe("A.md");
    expect(app.workspace.leaves[1].editor.isReading()).toBe(true);
  });
});
