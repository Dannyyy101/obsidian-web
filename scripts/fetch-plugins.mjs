// Lädt die mitgelieferten Community-Plugins (in Release-Form) nach public/bundled-plugins/.
// Die Dateien werden nicht eingecheckt: remotely-save enthält Code unter PolyForm-Strict-Lizenz.
// Aus demselben Grund landen sie auch nicht im Docker-Image, der Container lädt sie beim Start
// nach PLUGIN_DIR.
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";

// remotely-save installiert obsidian-web in jeden Vault (BUNDLED_PLUGINS im PluginManager), die
// übrigen dienen den Integrationstests (tests/<id>.test.ts).
const PLUGINS = [
  { id: "remotely-save", repo: "remotely-save/remotely-save", version: "0.5.25" },
  { id: "obsidian-latex-suite", repo: "artisticat1/obsidian-latex-suite", version: "1.14.1" },
  { id: "omnisearch", repo: "scambier/obsidian-omnisearch", version: "1.32.0" },
];
const FILES = ["main.js", "manifest.json", "styles.css"];
const force = process.argv.includes("--force");

for (const { id, repo, version } of PLUGINS) {
  const dir = join(process.env.PLUGIN_DIR ?? join("public", "bundled-plugins"), id);
  await mkdir(dir, { recursive: true });
  for (const file of FILES) {
    const target = join(dir, file);
    if (!force && (await access(target).then(() => true, () => false))) continue;
    const url = `https://github.com/${repo}/releases/download/${version}/${file}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    await writeFile(target, Buffer.from(await res.arrayBuffer()));
    console.log(`fetched ${id}@${version}/${file}`);
  }
}
