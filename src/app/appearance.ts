import type { Vault } from "../core/vault";

/** Felder aus Obsidians `.obsidian/appearance.json`, die obsidian-web auswertet. */
export interface AppearanceConfig {
  /** "obsidian" = dunkel, "moonstone" = hell, "system" bzw. fehlend = Systemeinstellung */
  theme?: string;
  baseFontSize?: number;
  textFontFamily?: string;
  interfaceFontFamily?: string;
  monospaceFontFamily?: string;
}

const FONT_VARS: [keyof AppearanceConfig, string][] = [
  ["textFontFamily", "--font-text-override"],
  ["interfaceFontFamily", "--font-interface-override"],
  ["monospaceFontFamily", "--font-monospace-override"],
];

const darkQuery = matchMedia("(prefers-color-scheme: dark)");
let config: AppearanceConfig = {};
let configVault: Vault | null = null;

function applyTheme() {
  const dark = config.theme === "obsidian" || (config.theme !== "moonstone" && darkQuery.matches);
  document.body.toggleClass("theme-dark", dark);
  document.body.toggleClass("theme-light", !dark);
}

function apply() {
  applyTheme();
  const style = document.body.style;
  for (const [key, cssVar] of FONT_VARS) {
    const value = config[key];
    if (typeof value === "string" && value.trim()) style.setProperty(cssVar, value);
    else style.removeProperty(cssVar);
  }
  if (typeof config.baseFontSize === "number" && config.baseFontSize > 0) {
    style.setProperty("--font-text-size", `${config.baseFontSize}px`);
  } else {
    style.removeProperty("--font-text-size");
  }
}

/** Hell/Dunkel nach System, bis ein Vault mit eigener Einstellung geladen ist. */
export function followSystemTheme(): void {
  darkQuery.addEventListener("change", applyTheme);
  applyTheme();
}

/**
 * Übernimmt Schriften, Schriftgröße und Theme aus `appearance.json` – so sieht der Vault aus wie in
 * Obsidian Desktop. Änderungen (auch per Sync) werden sofort angewendet.
 */
export async function loadAppearance(vault: Vault): Promise<void> {
  configVault = vault;
  const path = `${vault.configDir}/appearance.json`;
  const read = async () => {
    try {
      config = (await vault.adapter.exists(path)) ? JSON.parse(await vault.adapter.read(path)) : {};
    } catch (err) {
      console.error(`${path} konnte nicht gelesen werden`, err);
      config = {};
    }
    apply();
  };
  vault.on("raw", (changed: string) => changed === path && void read());
  await read();
}

/** Aktuelle Werte aus `appearance.json` (für den Einstellungsreiter „Darstellung“). */
export function getAppearance(): AppearanceConfig {
  return { ...config };
}

/**
 * Setzt einen Wert in `appearance.json` (`undefined` entfernt ihn) und wendet ihn sofort an. Liest die
 * Datei vorher neu, damit Felder, die obsidian-web nicht kennt, und Änderungen per Sync erhalten bleiben.
 */
export async function setAppearance<K extends keyof AppearanceConfig>(key: K, value: AppearanceConfig[K]): Promise<void> {
  const vault = configVault;
  if (!vault) return;
  const path = `${vault.configDir}/appearance.json`;
  let stored: Record<string, unknown> = {};
  try {
    if (await vault.adapter.exists(path)) stored = JSON.parse(await vault.adapter.read(path));
  } catch (err) {
    console.error(`${path} konnte nicht gelesen werden`, err);
  }
  if (value === undefined) delete stored[key];
  else stored[key] = value;
  config = stored as AppearanceConfig;
  apply();
  await vault.adapter.write(path, JSON.stringify(stored, null, 2));
}
