// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { App } from "../src/app/app";
import { Commands } from "../src/core/commands";
import { HotkeyManager, type KeyPress } from "../src/core/hotkeys";
import { Vault } from "../src/core/vault";
import { IndexedAdapter } from "../src/storage/indexed-adapter";
import { MemoryBackend, MemoryTimesStore } from "../src/storage/memory-backend";
import { installDomExtensions } from "../src/ui/dom";

let counter = 0;

async function createVault(files: Record<string, string> = {}) {
  const adapter = new IndexedAdapter(`H${counter++}`, new MemoryBackend(), new MemoryTimesStore());
  for (const [path, text] of Object.entries(files)) await adapter.write(path, text);
  const vault = new Vault(adapter);
  await vault.load();
  return vault;
}

async function setup(hotkeys?: unknown, isMac = false) {
  const vault = await createVault(hotkeys === undefined ? {} : { ".obsidian/hotkeys.json": JSON.stringify(hotkeys) });
  const commands = new Commands();
  const calls: string[] = [];
  commands.addCommand({ id: "editor:toggle-bold", name: "Fett", hotkeys: [{ modifiers: ["Mod"], key: "B" }], callback: () => calls.push("bold") });
  commands.addCommand({ id: "editor:toggle-comment", name: "Kommentar", hotkeys: [{ modifiers: ["Mod"], key: "/" }], callback: () => calls.push("comment") });
  commands.addCommand({ id: "workspace:new-tab", name: "Tab", hotkeys: [{ modifiers: ["Mod", "Alt"], key: "T" }], callback: () => calls.push("tab") });
  commands.addCommand({ id: "plugin:action", name: "Plugin", callback: () => calls.push("plugin") });
  const manager = new HotkeyManager(vault, commands, isMac);
  await manager.load();
  return { vault, manager, calls };
}

const press = (modifiers: string, key: string, code = ""): KeyPress => ({ modifiers, key, code });

describe("HotkeyManager", () => {
  it("nutzt ohne hotkeys.json die Standardkürzel", async () => {
    const { manager, calls } = await setup();
    expect(manager.onTrigger(press("Mod", "b", "KeyB"))).toBe(true);
    expect(manager.onTrigger(press("Mod,Shift", "B", "KeyB"))).toBe(false);
    expect(calls).toEqual(["bold"]);
  });

  it("ersetzt Standardkürzel durch hotkeys.json und entfernt sie mit leerer Liste", async () => {
    const { manager, calls } = await setup({
      "editor:toggle-bold": [],
      "plugin:action": [{ modifiers: ["Mod", "Shift"], key: "B" }],
    });
    expect(manager.onTrigger(press("Mod", "b", "KeyB"))).toBe(false);
    expect(manager.onTrigger(press("Mod,Shift", "B", "KeyB"))).toBe(true);
    expect(calls).toEqual(["plugin"]);
    expect(manager.getHotkeys("editor:toggle-bold")).toEqual([]);
    expect(manager.getDefaultHotkeys("editor:toggle-bold")).toEqual([{ modifiers: ["Mod"], key: "B" }]);
  });

  it("versteht Meta bzw. Ctrl aus Desktop-Vaults als Mod", async () => {
    const mac = await setup({ "plugin:action": [{ modifiers: ["Meta"], key: "J" }] }, true);
    expect(mac.manager.findCommandId(press("Mod", "j", "KeyJ"))).toBe("plugin:action");
    const pc = await setup({ "plugin:action": [{ modifiers: ["Ctrl"], key: "J" }] });
    expect(pc.manager.findCommandId(press("Mod", "j", "KeyJ"))).toBe("plugin:action");
  });

  it("erkennt Tasten über ihre Lage, wenn Alt das Zeichen ändert", async () => {
    const { manager } = await setup(undefined, true);
    expect(manager.findCommandId(press("Mod,Alt", "†", "KeyT"))).toBe("workspace:new-tab");
  });

  it("erkennt Satzzeichen, die nur mit Umschalt erreichbar sind", async () => {
    const { manager } = await setup();
    // Deutsche Tastatur: `/` ist Umschalt+7.
    expect(manager.findCommandId(press("Mod,Shift", "/", "Digit7"))).toBe("editor:toggle-comment");
  });

  it("überspringt kaputte Einträge und ungültiges JSON", async () => {
    const { manager } = await setup({ "plugin:action": [{ key: "J" }, { modifiers: ["Mod"], key: "J" }], other: "x" });
    expect(manager.getHotkeys("plugin:action")).toEqual([{ modifiers: ["Mod"], key: "J" }]);
    expect(manager.getHotkeys("other")).toBeUndefined();
    const vault = await createVault({ ".obsidian/hotkeys.json": "{" });
    const broken = new HotkeyManager(vault, new Commands(), false);
    await broken.load();
    expect(broken.customKeys).toEqual({});
  });

  it("speichert im Format von Obsidian", async () => {
    const { vault, manager } = await setup();
    manager.setHotkeys("plugin:action", [{ modifiers: ["Mod", "Shift"], key: "J" }]);
    manager.setHotkeys("editor:toggle-bold", []);
    await manager.save();
    expect(JSON.parse(await vault.adapter.read(".obsidian/hotkeys.json"))).toEqual({
      "plugin:action": [{ modifiers: ["Mod", "Shift"], key: "J" }],
      "editor:toggle-bold": [],
    });
    manager.removeHotkeys("editor:toggle-bold");
    expect(manager.getEffectiveHotkeys("editor:toggle-bold")).toEqual([{ modifiers: ["Mod"], key: "B" }]);
  });

  it("zeigt Kürzel passend zur Plattform an", async () => {
    expect((await setup(undefined, true)).manager.printHotkeyForCommand("workspace:new-tab")).toBe("⌥⌘T");
    expect((await setup()).manager.printHotkeyForCommand("workspace:new-tab")).toBe("Strg+Alt+T");
    expect((await setup()).manager.printHotkeyForCommand("plugin:action")).toBe("");
  });
});

describe("App", () => {
  beforeAll(() => installDomExtensions());

  it("führt Befehle über Kürzel aus hotkeys.json aus", async () => {
    const vault = await createVault({ ".obsidian/hotkeys.json": JSON.stringify({ "test:run": [{ modifiers: ["Mod", "Shift"], key: "J" }] }) });
    const root = document.createElement("div");
    document.body.appendChild(root);
    const app = new App(vault, root);
    await app.hotkeyManager.load();
    let runs = 0;
    app.commands.addCommand({ id: "test:run", name: "Test", callback: () => runs++ });
    const mac = /Mac|iPhone|iPad/.test(navigator.platform);
    const evt = new KeyboardEvent("keydown", { key: "J", code: "KeyJ", shiftKey: true, metaKey: mac, ctrlKey: !mac, cancelable: true });
    document.dispatchEvent(evt);
    expect(runs).toBe(1);
    expect(evt.defaultPrevented).toBe(true);
  });
});
