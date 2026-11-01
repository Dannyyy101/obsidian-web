// Lädt die mitgelieferten Community-Plugins (in Release-Form) nach public/bundled-plugins/.
// Die Dateien werden nicht eingecheckt: remotely-save enthält Code unter PolyForm-Strict-Lizenz.
// Aus demselben Grund landen sie auch nicht im Docker-Image, der Container lädt sie beim Start
// nach PLUGIN_DIR.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// remotely-save installiert obsidian-web in jeden Vault (BUNDLED_PLUGINS im PluginManager), die
// übrigen dienen den Integrationstests (tests/<id>.test.ts).
// Release-Assets lassen sich auf GitHub nachträglich austauschen, deshalb ist jede Datei per SHA-256
// festgelegt. Bei einem neuen Release die Hashes mit `shasum -a 256` neu ermitteln.
const PLUGINS = [
  {
    id: "remotely-save", repo: "remotely-save/remotely-save", version: "0.5.25",
    sha256: {
      "main.js": "b3afbd27f15188b9784618c958607869baa434dc0abcf072774f99362c11fa04",
      "manifest.json": "71d9c0b616003f3a696880e7aa88296e5b31555757e933a12d2900b96c4caa90",
      "styles.css": "87584e7d538ca58c527afbb2625b09ea282bcae7bf784b7cce33ca92e9e0dfb3",
    },
  },
  {
    id: "obsidian-latex-suite", repo: "artisticat1/obsidian-latex-suite", version: "1.14.1",
    sha256: {
      "main.js": "249d8b0eac976e3b9fa8518b68f448d79df07a780036362f514e66cea9fe3d4b",
      "manifest.json": "3201a8d5d2a01859dacdaf985d6d56545880a38f999c2147e5df2edb0a469365",
      "styles.css": "a2e2ef4dea479e9c2377f0a9883fe539fc2b129b244863424309f8f92c1dc814",
    },
  },
  {
    id: "omnisearch", repo: "scambier/obsidian-omnisearch", version: "1.32.0",
    sha256: {
      "main.js": "2734d64d4e483773f7921fd0710073519545f72c89f72caa9e96b3eaeb1e95ea",
      "manifest.json": "0e48f87a7bce226c398782760f52c0b892aaa396cd5a762f48a200c7e779021f",
      "styles.css": "c6a56b1a18ff867f12ebbb3a139060a249704281e1b449003ff487969621a2e6",
    },
  },
];
const force = process.argv.includes("--force");

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

for (const { id, repo, version, sha256: expected } of PLUGINS) {
  const dir = join(process.env.PLUGIN_DIR ?? join("public", "bundled-plugins"), id);
  await mkdir(dir, { recursive: true });
  for (const [file, hash] of Object.entries(expected)) {
    const target = join(dir, file);
    // Vorhandene Dateien nur behalten, wenn sie zum Hash passen (z. B. nicht von einer alten Version stammen).
    if (!force && sha256(await readFile(target).catch(() => "")) === hash) continue;
    const url = `https://github.com/${repo}/releases/download/${version}/${file}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const data = Buffer.from(await res.arrayBuffer());
    const actual = sha256(data);
    if (actual !== hash) throw new Error(`${url}: SHA-256 ${actual} statt ${hash}`);
    await writeFile(target, data);
    console.log(`fetched ${id}@${version}/${file}`);
  }
}
