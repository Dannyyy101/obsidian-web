import { describe, expect, it } from "vitest";
import { pastedImageName } from "../src/editor/attachments";
import { FileManager } from "../src/core/file-manager";
import { MemoryMetadataStore, MetadataCache, inlineParser } from "../src/core/metadata-cache";
import { Vault } from "../src/core/vault";
import { IndexedAdapter } from "../src/storage/indexed-adapter";
import { MemoryBackend, MemoryTimesStore } from "../src/storage/memory-backend";

async function setup(files: Record<string, string>) {
  const adapter = new IndexedAdapter("T", new MemoryBackend(), new MemoryTimesStore());
  for (const [path, text] of Object.entries(files)) await adapter.write(path, text);
  const vault = new Vault(adapter);
  await vault.load();
  const cache = new MetadataCache(vault, inlineParser, new MemoryMetadataStore());
  await cache.initialize();
  return { vault, cache, files: new FileManager(vault, cache) };
}

describe("Anhänge", () => {
  it("benennt eingefügte Bilder wie Obsidian", () => {
    expect(pastedImageName(new Date(2024, 0, 31, 9, 5, 7), "png")).toBe("Pasted image 20240131090507.png");
  });

  it("legt Anhänge gemäß attachmentFolderPath ab", async () => {
    const { vault, files } = await setup({ "Ordner/Notiz.md": "", "Bild.png": "x" });
    expect(await files.getAvailablePathForAttachment("Bild.png", "Ordner/Notiz.md")).toBe("Bild 1.png");
    await vault.setConfig("attachmentFolderPath", "./");
    expect(await files.getAvailablePathForAttachment("Bild.png", "Ordner/Notiz.md")).toBe("Ordner/Bild.png");
    await vault.setConfig("attachmentFolderPath", "./assets");
    expect(await files.getAvailablePathForAttachment("Bild.png", "Ordner/Notiz.md")).toBe("Ordner/assets/Bild.png");
    expect(vault.getFolderByPath("Ordner/assets")).not.toBeNull();
    await vault.setConfig("attachmentFolderPath", "Anhänge");
    expect(await files.getAvailablePathForAttachment("Bild.png", "Ordner/Notiz.md")).toBe("Anhänge/Bild.png");
  });

  it("erzeugt Embeds als Wikilink oder Markdown-Link", async () => {
    const { vault, cache, files } = await setup({ "Notiz.md": "" });
    const image = await vault.createBinary("a/Mein Bild.png", new ArrayBuffer(1));
    await cache.whenIdle();
    expect(files.generateMarkdownLink(image, "Notiz.md")).toBe("![[Mein Bild.png]]");
    await vault.setConfig("useMarkdownLinks", true);
    expect(files.generateMarkdownLink(image, "Notiz.md")).toBe("![](Mein%20Bild.png)");
  });
});
