import type { Vault } from "../core/vault";

/** Fields from Obsidian's `.obsidian/appearance.json` that obsidian-web evaluates. */
export interface AppearanceConfig {
  /** "obsidian" = dark, "moonstone" = light, "system" or missing = system setting */
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
/** Pending `setAppearance` calls, run one after another so none overwrites another's change. */
let writes: Promise<void> = Promise.resolve();

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

/** Light/dark from the system until a vault with its own setting is loaded. */
export function followSystemTheme(): void {
  darkQuery.addEventListener("change", applyTheme);
  applyTheme();
}

/**
 * Applies fonts, font size and theme from `appearance.json`, so the vault looks like it does in
 * Obsidian Desktop. Changes (including via sync) are applied immediately.
 */
export async function loadAppearance(vault: Vault): Promise<void> {
  configVault = vault;
  const path = `${vault.configDir}/appearance.json`;
  const read = async () => {
    try {
      config = (await vault.adapter.exists(path)) ? JSON.parse(await vault.adapter.read(path)) : {};
    } catch (err) {
      console.error(`Could not read ${path}`, err);
      config = {};
    }
    apply();
  };
  vault.on("raw", (changed: string) => changed === path && void read());
  await read();
}

/** Current values from `appearance.json` (for the "Appearance" settings tab). */
export function getAppearance(): AppearanceConfig {
  return { ...config };
}

/**
 * Sets a value in `appearance.json` (`undefined` removes it) and applies it immediately. Re-reads the
 * file first, so fields obsidian-web does not know and changes made via sync are kept. Calls run one
 * after another; otherwise two quick changes would both read the old file and the second would drop
 * the first.
 */
export function setAppearance<K extends keyof AppearanceConfig>(key: K, value: AppearanceConfig[K]): Promise<void> {
  const run = writes.then(() => writeAppearance(key, value));
  writes = run.catch(() => {});
  return run;
}

async function writeAppearance<K extends keyof AppearanceConfig>(key: K, value: AppearanceConfig[K]): Promise<void> {
  const vault = configVault;
  if (!vault) return;
  const path = `${vault.configDir}/appearance.json`;
  let stored: Record<string, unknown> = {};
  try {
    if (await vault.adapter.exists(path)) stored = JSON.parse(await vault.adapter.read(path));
  } catch (err) {
    console.error(`Could not read ${path}`, err);
  }
  if (value === undefined) delete stored[key];
  else stored[key] = value;
  config = stored as AppearanceConfig;
  apply();
  await vault.adapter.write(path, JSON.stringify(stored, null, 2));
}
