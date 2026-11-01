// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { getAppearance, loadAppearance, setAppearance } from "../src/app/appearance";
import { Vault } from "../src/core/vault";
import { IndexedAdapter } from "../src/storage/indexed-adapter";
import { MemoryBackend, MemoryTimesStore } from "../src/storage/memory-backend";
import { installDomExtensions } from "../src/ui/dom";

describe("appearance.json", () => {
  beforeAll(() => installDomExtensions());

  it("applies fonts, font size and theme from Obsidian and reacts to sync changes", async () => {
    const adapter = new IndexedAdapter("T", new MemoryBackend(), new MemoryTimesStore());
    await adapter.write(
      ".obsidian/appearance.json",
      JSON.stringify({ theme: "moonstone", baseFontSize: 18, textFontFamily: "Georgia", monospaceFontFamily: "" }),
    );
    const vault = new Vault(adapter);
    await vault.load();
    await loadAppearance(vault);

    const style = document.body.style;
    expect(style.getPropertyValue("--font-text-override")).toBe("Georgia");
    expect(style.getPropertyValue("--font-monospace-override")).toBe("");
    expect(style.getPropertyValue("--font-text-size")).toBe("18px");
    expect(document.body.classList.contains("theme-light")).toBe(true);

    // Sync writes a new version of the file.
    await adapter.write(".obsidian/appearance.json", JSON.stringify({ theme: "obsidian" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(style.getPropertyValue("--font-text-override")).toBe("");
    expect(style.getPropertyValue("--font-text-size")).toBe("");
    expect(document.body.classList.contains("theme-dark")).toBe(true);
  });

  it("keeps every value when several changes are made at once", async () => {
    const adapter = new IndexedAdapter("T", new MemoryBackend(), new MemoryTimesStore());
    await adapter.write(".obsidian/appearance.json", JSON.stringify({ cssTheme: "Minimal" }));
    const vault = new Vault(adapter);
    await vault.load();
    await loadAppearance(vault);

    await Promise.all([setAppearance("theme", "moonstone"), setAppearance("baseFontSize", 20)]);

    expect(JSON.parse(await adapter.read(".obsidian/appearance.json"))).toEqual({ cssTheme: "Minimal", theme: "moonstone", baseFontSize: 20 });
    expect(getAppearance()).toMatchObject({ theme: "moonstone", baseFontSize: 20 });
  });
});
