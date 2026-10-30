import { describe, expect, it } from "vitest";
import { TFile, TFolder, Vault } from "../src/core/vault";
import { IndexedAdapter } from "../src/storage/indexed-adapter";
import { MemoryBackend, MemoryTimesStore } from "../src/storage/memory-backend";

async function setup(backend = new MemoryBackend(), times = new MemoryTimesStore()) {
  const adapter = new IndexedAdapter("Test", backend, times);
  const vault = new Vault(adapter);
  await vault.load();
  const events: string[] = [];
  for (const name of ["create", "modify", "delete", "rename"]) {
    vault.on(name, (file: TFile | TFolder, oldPath?: string) =>
      events.push(`${name}:${file.path}${oldPath ? `<-${oldPath}` : ""}`),
    );
  }
  return { adapter, vault, events, backend, times };
}

const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe("Vault + IndexedAdapter", () => {
  it("übernimmt die mtime aus writeBinary (Voraussetzung für den Sync)", async () => {
    const { adapter, vault } = await setup();
    await adapter.writeBinary("Notes/a.md", bytes("hallo"), { mtime: 1_700_000_000_000, ctime: 1_600_000_000_000 });
    const file = vault.getFileByPath("Notes/a.md")!;
    expect(file.stat).toEqual({ mtime: 1_700_000_000_000, ctime: 1_600_000_000_000, size: 5 });
    expect(await adapter.stat("Notes/a.md")).toMatchObject({ type: "file", mtime: 1_700_000_000_000 });
  });

  it("behält mtimes über einen Neustart hinweg", async () => {
    const first = await setup();
    await first.adapter.write("a.md", "x", { mtime: 42_000 });
    const second = await setup(first.backend, first.times);
    expect(second.vault.getFileByPath("a.md")!.stat.mtime).toBe(42_000);
  });

  it("spiegelt Adapter-Schreibzugriffe als Vault-Events", async () => {
    const { adapter, vault, events } = await setup();
    await adapter.write("Ordner/neu.md", "a");
    await adapter.write("Ordner/neu.md", "b");
    expect(events).toEqual(["create:Ordner", "create:Ordner/neu.md", "modify:Ordner/neu.md"]);
    expect(vault.getFolderByPath("Ordner")!.children.map((c) => c.name)).toEqual(["neu.md"]);
  });

  it("hält versteckte Pfade aus dem Baum, der Adapter listet sie aber", async () => {
    const { adapter, vault, events } = await setup();
    await adapter.write(".obsidian/plugins/x/data.json", "{}");
    expect(vault.getAllLoadedFiles().map((f) => f.path)).toEqual(["/"]);
    expect(events).toEqual([]);
    expect(await adapter.list(".obsidian")).toEqual({ files: [], folders: [".obsidian/plugins"] });
  });

  it("benennt Ordner samt Inhalt um und erhält mtimes", async () => {
    const { adapter, vault, events } = await setup();
    await adapter.write("A/B/c.md", "c", { mtime: 5_000 });
    events.length = 0;
    await vault.rename(vault.getFolderByPath("A")!, "Z");
    expect(vault.getFileByPath("Z/B/c.md")!.stat.mtime).toBe(5_000);
    expect(vault.getAbstractFileByPath("A")).toBeNull();
    expect(events).toContain("rename:Z<-A");
    expect(events).toContain("rename:Z/B/c.md<-A/B/c.md");
    expect(await adapter.read("Z/B/c.md")).toBe("c");
  });

  it("benennt nur die Groß-/Kleinschreibung um", async () => {
    const { adapter, vault } = await setup();
    await adapter.write("notiz.md", "n");
    await vault.rename(vault.getFileByPath("notiz.md")!, "Notiz.md");
    expect(vault.getFileByPath("Notiz.md")).toBeInstanceOf(TFile);
    expect(vault.getFileByPath("notiz.md")).toBeNull();
    expect(await adapter.read("Notiz.md")).toBe("n");
  });

  it("verschiebt beim Löschen nach .trash", async () => {
    const { adapter, vault, events } = await setup();
    await adapter.write("weg.md", "w");
    events.length = 0;
    await vault.trash(vault.getFileByPath("weg.md")!, true);
    expect(vault.getFileByPath("weg.md")).toBeNull();
    expect(events).toEqual(["delete:weg.md"]);
    expect(await adapter.read(".trash/weg.md")).toBe("w");
  });

  it("verweigert vault.create für vorhandene Dateien", async () => {
    const { vault } = await setup();
    await vault.create("a.md", "1");
    await expect(vault.create("a.md", "2")).rejects.toThrow("File already exists.");
  });
});

/** Verhält sich wie Safaris OPFS: legt Namen in NFD ab und findet sie in jeder Unicode-Form. */
class NfdBackend extends MemoryBackend {
  override async walk() {
    return (await super.walk()).map((e) => ({ ...e, path: e.path.normalize("NFD") }));
  }
  override async readFile(path: string) {
    return super.readFile(path.normalize("NFC"));
  }
  override async writeFile(path: string, data: ArrayBuffer) {
    return super.writeFile(path.normalize("NFC"), data);
  }
  override async mkdir(path: string) {
    return super.mkdir(path.normalize("NFC"));
  }
  override async remove(path: string) {
    return super.remove(path.normalize("NFC"));
  }
}

describe("Unicode-Schreibweisen (NFC/NFD)", () => {
  const nfc = "Uni/Übungen/Binäre Addition.md".normalize("NFC");
  const nfd = nfc.normalize("NFD");

  it("findet NFC-Dateien nach einem Neustart auf einem NFD-Backend wieder (Safari)", async () => {
    const first = await setup(new NfdBackend());
    await first.adapter.write(nfc, "inhalt", { mtime: 7_000 });
    const second = await setup(first.backend, first.times);
    const file = second.vault.getFileByPath(nfc)!;
    expect(file.path).toBe(nfc);
    expect(file.stat.mtime).toBe(7_000);
    expect(await second.vault.read(file)).toBe("inhalt");
    expect(second.vault.getAllFolders().map((f) => f.path).sort()).toEqual(["Uni", "Uni/Übungen".normalize("NFC")]);
  });

  it("behält NFD-Pfade vom Server exakt bei und findet sie auch per NFC", async () => {
    const first = await setup(new NfdBackend());
    await first.adapter.write(nfd, "vom Finder", { mtime: 8_000 });
    const second = await setup(first.backend, first.times);
    expect(second.vault.getFiles().map((f) => f.path)).toEqual([nfd]);
    expect(await second.adapter.exists(nfd)).toBe(true);
    expect(await second.adapter.stat(nfd)).toMatchObject({ mtime: 8_000 });
    expect(second.vault.getFileByPath(nfc)?.path).toBe(nfd);
  });

  it("legt bei abweichender Schreibweise keine zweite Datei an", async () => {
    const { adapter, vault } = await setup();
    await adapter.write(nfd, "a");
    await adapter.write(nfc, "b");
    expect(vault.getFiles().map((f) => f.path)).toEqual([nfd]);
    expect(await adapter.read(nfd)).toBe("b");
  });

  it("stellt Ordner-Schreibweisen aus Altdaten ohne Ordner-Eintrag wieder her", async () => {
    const backend = new NfdBackend();
    const times = new MemoryTimesStore();
    await backend.mkdir("Uni");
    await backend.mkdir("Uni/Übungen");
    await backend.writeFile(nfc, new ArrayBuffer(1));
    times.times.set(nfc, { mtime: 9_000, ctime: 9_000 }); // wie vor dem Fix: nur die Datei erfasst
    const { vault } = await setup(backend, times);
    expect(vault.getAllFolders().map((f) => f.path).sort()).toEqual(["Uni", "Uni/Übungen".normalize("NFC")]);
    expect(vault.getFileByPath(nfc)!.stat.mtime).toBe(9_000);
  });
});

describe("MetadataCache.getFirstLinkpathDest", () => {
  it("löst Links wie Obsidian auf", async () => {
    const { MetadataCache } = await import("../src/core/metadata-cache");
    const { vault } = await setup();
    for (const p of ["Notiz.md", "A/Notiz.md", "A/B/Tief.md", "Bilder/foto.png", "B/Tief.md"]) await vault.create(p, "");
    const cache = new MetadataCache(vault);
    const dest = (link: string, source = "Start.md") => cache.getFirstLinkpathDest(link, source)?.path ?? null;

    expect(dest("Notiz")).toBe("Notiz.md"); // kürzester Pfad
    expect(dest("Notiz", "A/Andere.md")).toBe("A/Notiz.md"); // gleicher Ordner
    expect(dest("notiz#Kapitel")).toBe("Notiz.md"); // Groß-/Kleinschreibung, Abschnitt
    expect(dest("B/Tief")).toBe("B/Tief.md"); // Pfad ab Vault-Wurzel
    expect(dest("Tief", "A/B/x.md")).toBe("A/B/Tief.md");
    expect(dest("foto.png")).toBe("Bilder/foto.png");
    expect(dest("Fehlt")).toBeNull();
  });
});
