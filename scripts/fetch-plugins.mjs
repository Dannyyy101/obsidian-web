// Lädt die mitgelieferten Community-Plugins (in Release-Form) nach public/bundled-plugins/.
// Die Dateien werden nicht eingecheckt: remotely-save enthält Code unter PolyForm-Strict-Lizenz.
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";

const PLUGINS = [
  { id: "remotely-save", repo: "remotely-save/remotely-save", version: "0.5.25" },
];
const FILES = ["main.js", "manifest.json", "styles.css"];
const force = process.argv.includes("--force");

for (const { id, repo, version } of PLUGINS) {
  const dir = join("public", "bundled-plugins", id);
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
