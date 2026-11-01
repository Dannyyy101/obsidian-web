// ESLint-Konfiguration für die Schichtgrenzen aus docs/KONZEPT.md (Abschnitt 3). Sie liegt in einem
// eigenen Paket, weil @typescript-eslint/parser die JS-API von TypeScript braucht, die es ab
// TypeScript 7 nicht mehr gibt; dieses Paket bringt dafür sein eigenes TypeScript 6 mit.
import tsParser from "@typescript-eslint/parser";
import boundaries from "eslint-plugin-boundaries";

// Schichten von oben nach unten. Eine Schicht darf sich selbst, ihre Nachbarn in derselben Zeile und
// alle Schichten darunter importieren. src/main.ts setzt alles zusammen und gehört zu keiner Schicht.
const layers = [
  ["app"],
  ["plugins", "api"],
  ["ui", "editor"],
  ["markdown", "core"],
  ["storage", "shared"],
];

const below = (row) => layers.slice(row).flat();
const element = (type) => ({ element: { type } });

// Ohne DOM, weil diese Schichten auch im Worker laufen.
const domFree = ["core", "markdown", "storage", "shared"];

export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: { parser: tsParser },
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        ...layers.flat().map((type) => ({ type, pattern: `src/${type}` })),
      ],
      "import/resolver": { node: { extensions: [".ts", ".js"] } },
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          message: "{{from.type}} darf {{to.type}} nicht importieren (Schichtgrenzen, docs/KONZEPT.md 3)",
          policies: [
            ...layers.map((types, row) => ({
              from: element(types.filter((t) => t !== "plugins")),
              allow: { to: element(below(row)) },
            })),
            // Core-Plugins nutzen nur die öffentliche API, wie ein Community-Plugin.
            {
              from: element("plugins"),
              allow: { to: element(["plugins", "api"]) },
            },
            // `App` ist wie in obsidian.d.ts der zentrale Typ, den alle Schichten herumreichen. Als
            // reiner Typ-Import erzeugt er keine Laufzeitabhängigkeit nach oben.
            {
              from: element(["api", "ui", "editor"]),
              allow: { to: element("app"), dependency: { kind: "type", specifiers: "App" } },
            },
          ],
        },
      ],
    },
  },
  {
    files: domFree.map((layer) => `src/${layer}/**/*.ts`),
    rules: {
      "no-restricted-globals": [
        "error",
        ...["window", "document"].map((name) => ({
          name,
          message: "core, markdown, storage und shared laufen auch im Worker und greifen nicht auf das DOM zu",
        })),
      ],
    },
  },
];
