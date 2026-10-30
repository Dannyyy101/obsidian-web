import { describe, expect, it } from "vitest";
import { FileManager } from "../src/core/file-manager";
import { MemoryMetadataStore, MetadataCache, inlineParser } from "../src/core/metadata-cache";
import { Vault } from "../src/core/vault";
import { IndexedAdapter } from "../src/storage/indexed-adapter";
import { MemoryBackend, MemoryTimesStore } from "../src/storage/memory-backend";

async function setup(files: Record<string, string>, store = new MemoryMetadataStore()) {
  const adapter = new IndexedAdapter("T", new MemoryBackend(), new MemoryTimesStore());
  for (const [path, text] of Object.entries(files)) await adapter.write(path, text);
  const vault = new Vault(adapter);
  await vault.load();
  let parses = 0;
  const cache = new MetadataCache(vault, (t) => (parses++, inlineParser(t)), store);
  await cache.initialize();
  return { vault, cache, store, files: new FileManager(vault, cache), parses: () => parses };
}

const read = (vault: Vault, path: string) => vault.read(vault.getFileByPath(path)!);

describe("MetadataCache", () => {
  it("löst Links auf und zählt Backlinks", async () => {
    const { vault, cache } = await setup({
      "Ziel.md": "# Ziel",
      "A.md": "[[Ziel]] und [[Ziel#Abschnitt|x]] und [[Fehlt]]",
      "Ordner/B.md": "![[Ziel]] [md](../Ziel.md)",
    });
    expect(cache.resolvedLinks["A.md"]).toEqual({ "Ziel.md": 2 });
    expect(cache.unresolvedLinks["A.md"]).toEqual({ Fehlt: 1 });
    const backlinks = cache.getBacklinksForFile(vault.getFileByPath("Ziel.md")!);
    expect([...backlinks.keys()].sort()).toEqual(["A.md", "Ordner/B.md"]);
    expect(backlinks.get("A.md")!.length).toBe(2);
  });

  it("aktualisiert sich bei Änderungen und neuen Dateien", async () => {
    const { vault, cache } = await setup({ "A.md": "[[Neu]]" });
    expect(cache.unresolvedLinks["A.md"]).toEqual({ Neu: 1 });
    await vault.create("Neu.md", "");
    await cache.whenIdle();
    expect(cache.resolvedLinks["A.md"]).toEqual({ "Neu.md": 1 });
    await vault.modify(vault.getFileByPath("A.md")!, "nichts mehr");
    await cache.whenIdle();
    expect(cache.resolvedLinks["A.md"]).toEqual({});
  });

  it("parst nach einem Neustart nur geänderte Dateien", async () => {
    const first = await setup({ "A.md": "a", "B.md": "b" });
    expect(first.parses()).toBe(2);
    const adapter = first.vault.adapter;
    const vault = new Vault(adapter);
    await vault.load();
    await adapter.write("B.md", "geändert");
    let parses = 0;
    const cache = new MetadataCache(vault, (t) => (parses++, inlineParser(t)), first.store);
    await cache.initialize();
    expect(parses).toBe(1);
  });
});

describe("FileManager.renameFile aktualisiert Links", () => {
  it("Wikilinks mit Abschnitt und Alias, Embeds und Markdown-Links", async () => {
    const { vault, files } = await setup({
      "Alt.md": "# Alt",
      "A.md": "[[Alt]], [[Alt#Kapitel|Alias]], ![[Alt]] und [x](Alt.md) und [[Anderes]]",
    });
    await files.renameFile(vault.getFileByPath("Alt.md")!, "Neu Name.md");
    expect(await read(vault, "A.md")).toBe(
      "[[Neu Name]], [[Neu Name#Kapitel|Alias]], ![[Neu Name]] und [x](Neu%20Name.md) und [[Anderes]]",
    );
  });

  it("nutzt den vollen Pfad, wenn der Name nicht eindeutig ist", async () => {
    const { vault, files } = await setup({ "X/Notiz.md": "", "Y/Alt.md": "", "Q.md": "[[Alt]]", "Notiz.md": "" });
    await files.renameFile(vault.getFileByPath("Y/Alt.md")!, "Y/Notiz.md");
    expect(await read(vault, "Q.md")).toBe("[[Y/Notiz]]");
  });

  it("Ordner verschieben aktualisiert Links auf alle enthaltenen Dateien, auch zwischen ihnen", async () => {
    const { vault, files } = await setup({
      "Projekt/Plan.md": "[[Projekt/Ideen]]",
      "Projekt/Ideen.md": "",
      "Index.md": "[[Projekt/Plan]] [[Ideen]]",
      "Anderswo/Ideen.md": "",
    });
    await files.renameFile(vault.getFolderByPath("Projekt")!, "Archiv/Projekt");
    // `[[Ideen]]` zeigte auf Projekt/Ideen (kürzester Pfad); nach dem Verschieben wäre das
    // Anderswo/Ideen – also wird der volle Pfad geschrieben, damit das Ziel gleich bleibt.
    expect(await read(vault, "Index.md")).toBe("[[Plan]] [[Archiv/Projekt/Ideen]]");
    // Aus demselben Ordner heraus reicht der Name (gleicher Ordner hat Vorrang).
    expect(await read(vault, "Archiv/Projekt/Plan.md")).toBe("[[Ideen]]");
  });

  it("respektiert alwaysUpdateLinks: false", async () => {
    const { vault, files } = await setup({ "Alt.md": "", "A.md": "[[Alt]]" });
    await vault.setConfig("alwaysUpdateLinks", false);
    await files.renameFile(vault.getFileByPath("Alt.md")!, "Neu.md");
    expect(await read(vault, "A.md")).toBe("[[Alt]]");
  });
});
