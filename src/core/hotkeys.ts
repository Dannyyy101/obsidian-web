import type { Commands } from "./commands";
import type { Vault } from "./vault";

export type Modifier = "Mod" | "Ctrl" | "Meta" | "Shift" | "Alt";

/** Entspricht Obsidians `Hotkey`, so steht es auch in `hotkeys.json`. */
export interface Hotkey {
  modifiers: Modifier[];
  key: string;
}

/** Gedrückte Tasten ohne DOM-Bezug: Modifier wie `"Mod,Shift"`, `key`/`code` wie in `KeyboardEvent`. */
export interface KeyPress {
  modifiers: string;
  key: string;
  code: string;
}

const MODIFIER_ORDER: Modifier[] = ["Mod", "Ctrl", "Meta", "Shift", "Alt"];

/** Modifier in Obsidians Schreibweise, z. B. `"Mod,Shift"`. Cmd (Mac) bzw. Strg (sonst) wird zu Mod. */
export function normalizeModifiers(modifiers: string[], isMac: boolean): string {
  const mapped = modifiers.map((m) => (m === (isMac ? "Meta" : "Ctrl") ? "Mod" : m));
  return MODIFIER_ORDER.filter((m) => mapped.includes(m)).join(",");
}

const CODE_KEYS: Record<string, string> = {
  Slash: "/",
  Backslash: "\\",
  Comma: ",",
  Period: ".",
  Minus: "-",
  Equal: "=",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  BracketLeft: "[",
  BracketRight: "]",
};

/** Taste nach physischer Lage (`KeyT` → `T`), weil Alt auf dem Mac das Zeichen ändert (Alt+T → †). */
function keyFromCode(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  return CODE_KEYS[code] ?? code;
}

function matches(hotkey: Hotkey, press: KeyPress, isMac: boolean): boolean {
  const mods = normalizeModifiers(hotkey.modifiers, isMac);
  const key = hotkey.key.toLowerCase();
  if (mods === press.modifiers && (key === press.key.toLowerCase() || key === keyFromCode(press.code).toLowerCase())) return true;
  // Satzzeichen, die nur mit Umschalt erreichbar sind (`/` ist auf deutscher Tastatur Umschalt+7).
  const shifted = press.key.length === 1 && press.key.toLowerCase() === press.key.toUpperCase();
  return shifted && key === press.key && mods === press.modifiers.split(",").filter((m) => m !== "Shift").join(",");
}

const MAC_SYMBOLS: Record<string, string> = { Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Mod: "⌘", Meta: "⌘" };
const PC_NAMES: Record<string, string> = { Mod: "Strg", Ctrl: "Strg", Meta: "Win", Alt: "Alt", Shift: "Umschalt" };
const KEY_NAMES: Record<string, string> = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", " ": "Leertaste" };

/**
 * Entspricht Obsidians `app.hotkeyManager`: Standardkürzel kommen aus `Command.hotkeys`, eigene aus
 * `.obsidian/hotkeys.json` und ersetzen sie (eine leere Liste entfernt das Standardkürzel).
 */
export class HotkeyManager {
  customKeys: Record<string, Hotkey[]> = {};

  constructor(
    private vault: Vault,
    private commands: Commands,
    private isMac: boolean,
  ) {}

  private get path() {
    return `${this.vault.configDir}/hotkeys.json`;
  }

  async load(): Promise<void> {
    try {
      if (!(await this.vault.adapter.exists(this.path))) return;
      const data: unknown = JSON.parse(await this.vault.adapter.read(this.path));
      this.customKeys = {};
      if (!data || typeof data !== "object") return;
      for (const [id, hotkeys] of Object.entries(data)) {
        if (Array.isArray(hotkeys)) this.customKeys[id] = hotkeys.filter((h) => h && typeof h.key === "string" && Array.isArray(h.modifiers));
      }
    } catch (err) {
      console.error(`${this.path} ist kein gültiges JSON`, err);
    }
  }

  async save(): Promise<void> {
    await this.vault.adapter.write(this.path, JSON.stringify(this.customKeys, null, 2));
  }

  /** Eigene Kürzel aus `hotkeys.json`, `undefined`, wenn der Befehl dort nicht steht. */
  getHotkeys(id: string): Hotkey[] | undefined {
    return this.customKeys[id];
  }

  getDefaultHotkeys(id: string): Hotkey[] | undefined {
    return this.commands.commands.get(id)?.hotkeys;
  }

  setHotkeys(id: string, hotkeys: Hotkey[]): void {
    this.customKeys[id] = hotkeys;
  }

  /** Eigene Kürzel verwerfen, danach gelten wieder die Standardkürzel. */
  removeHotkeys(id: string): void {
    delete this.customKeys[id];
  }

  /** Kürzel, die für den Befehl tatsächlich gelten. */
  getEffectiveHotkeys(id: string): Hotkey[] {
    return this.getHotkeys(id) ?? this.getDefaultHotkeys(id) ?? [];
  }

  /** Befehl, an den die Tastenkombination gebunden ist. */
  findCommandId(press: KeyPress): string | null {
    for (const id of new Set([...Object.keys(this.customKeys), ...this.commands.commands.keys()])) {
      if (this.getEffectiveHotkeys(id).some((h) => matches(h, press, this.isMac))) return id;
    }
    return null;
  }

  /** Führt den gebundenen Befehl aus; true, wenn er die Tasten übernommen hat. */
  onTrigger(press: KeyPress): boolean {
    const id = this.findCommandId(press);
    return !!id && this.commands.executeCommandById(id);
  }

  /** Erstes Kürzel des Befehls zum Anzeigen, z. B. `⌘P` bzw. `Strg+P`. */
  printHotkeyForCommand(id: string): string {
    const hotkey = this.getEffectiveHotkeys(id)[0];
    return hotkey ? this.printHotkey(hotkey) : "";
  }

  printHotkey(hotkey: Hotkey): string {
    const key = KEY_NAMES[hotkey.key] ?? (hotkey.key.length === 1 ? hotkey.key.toUpperCase() : hotkey.key);
    const mods = normalizeModifiers(hotkey.modifiers, this.isMac).split(",").filter(Boolean);
    if (this.isMac) return ["Ctrl", "Alt", "Shift", "Mod", "Meta"].filter((m) => mods.includes(m)).map((m) => MAC_SYMBOLS[m]).join("") + key;
    return [...mods.map((m) => PC_NAMES[m]), key].join("+");
  }
}
