// @vitest-environment happy-dom
// Integrationstest: Das unveränderte Latex Suite (Release-Build) läuft im Editor von obsidian-web:
// Snippets werden beim Tippen expandiert, die Formelvorschau rendert mit KaTeX.
import { existsSync, readFileSync } from "node:fs";
import { EditorView } from "@codemirror/view";
import { beforeAll, describe, expect, it } from "vitest";
import { App } from "../src/app/app";
import { Vault } from "../src/core/vault";
import { IndexedAdapter } from "../src/storage/indexed-adapter";
import { MemoryBackend, MemoryTimesStore } from "../src/storage/memory-backend";
import { installDomExtensions } from "../src/ui/dom";

const ID = "obsidian-latex-suite";
const PLUGIN_DIR = `public/bundled-plugins/${ID}`;
const hasPlugin = existsSync(`${PLUGIN_DIR}/main.js`);

/**
 * Latex Suite lädt seine Snippets per `import()` einer Blob-URL. Im Browser geht das direkt, in
 * Vitest nicht: Node importiert keine Blob-URLs, und Code aus `new Function` darf im VM-Kontext
 * gar nicht dynamisch importieren. Deshalb wird die Blob-URL zur data:-URL und der eine `import()`
 * des Plugins beim Auswerten an die Testdatei weitergereicht. Die Plugin-Datei bleibt unverändert.
 */
function bridgeBlobImports() {
  (globalThis as any).__testImport = (url: string) => import(/* @vite-ignore */ url);
  const NativeFunction = globalThis.Function;
  globalThis.Function = new Proxy(NativeFunction, {
    construct(target, args: string[]) {
      const code = args.at(-1) ?? "";
      if (code.includes("//# sourceURL=plugin:")) args[args.length - 1] = code.replace(/(?<![\w$.])import\(/g, "__testImport(");
      return Reflect.construct(target, args);
    },
  });
  const sources = new WeakMap<Blob, string>();
  const BrowserBlob = globalThis.Blob;
  globalThis.Blob = class extends BrowserBlob {
    constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
      super(parts, options);
      if (options?.type === "text/javascript") sources.set(this, (parts ?? []).join(""));
    }
  };
  const createObjectURL = URL.createObjectURL.bind(URL);
  const revokeObjectURL = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (obj: Blob | MediaSource) => {
    const source = obj instanceof Blob ? sources.get(obj) : undefined;
    return source === undefined ? createObjectURL(obj) : `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
  };
  URL.revokeObjectURL = (url: string) => {
    if (!url.startsWith("data:")) revokeObjectURL(url);
  };
}

let counter = 0;

async function setup() {
  const adapter = new IndexedAdapter(`LS${counter++}`, new MemoryBackend(), new MemoryTimesStore());
  for (const file of ["manifest.json", "main.js", "styles.css"]) {
    await adapter.write(`.obsidian/plugins/${ID}/${file}`, readFileSync(`${PLUGIN_DIR}/${file}`, "utf8"));
  }
  await adapter.write(".obsidian/community-plugins.json", JSON.stringify([ID]));
  await adapter.write("Formeln.md", "");
  const vault = new Vault(adapter);
  await vault.load();
  const root = document.createElement("div");
  document.body.appendChild(root);
  const app = new App(vault, root);
  await app.plugins.loadEnabled();
  await app.workspace.restoreLayout();
  app.workspace.setLayoutReady();
  await app.openFileAt(vault.getFileByPath("Formeln.md")!);
  const view = EditorView.findFromDOM(app.editor.containerEl.querySelector<HTMLElement>(".cm-editor")!)!;
  // Ohne Fokus schreibt CodeMirror keine DOM-Auswahl; happy-dom meldet sie sonst synchron zurück.
  view.contentDOM.blur();
  return { app, view, plugin: app.plugins.getPlugin(ID) as any };
}

/**
 * Tippt Zeichen für Zeichen wie der Browser: erst `keydown` (dort greifen die Snippets), dann,
 * falls nicht verhindert, die `inputHandler` und schließlich das Einfügen.
 */
function type(view: EditorView, text: string) {
  for (const ch of text) {
    if (!pressKey(view, ch)) continue;
    const { from, to } = view.state.selection.main;
    const insert = () => view.state.update({ changes: { from, to, insert: ch }, selection: { anchor: from + ch.length }, userEvent: "input.type" });
    const handled = view.state.facet(EditorView.inputHandler).some((handler) => handler(view, from, to, ch, insert));
    if (!handled) view.dispatch(insert());
  }
}

/** Liefert false, wenn ein Handler die Standardaktion verhindert hat. */
function pressKey(view: EditorView, key: string): boolean {
  return view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

describe.skipIf(!hasPlugin)("Latex Suite in obsidian-web", () => {
  beforeAll(() => {
    installDomExtensions();
    bridgeBlobImports();
  });

  it("lädt das Plugin samt Snippets und Einstellungsreiter", async () => {
    const { app, plugin } = await setup();
    expect(plugin).toBeTruthy();
    expect(plugin.CMSettings.snippets.all.length).toBeGreaterThan(100);
    app.setting.openTabById(ID);
    expect(document.querySelector(".mod-settings")?.textContent).toContain("Snippets");
    app.setting.close();
  });

  it("expandiert Snippets beim Tippen, in Text und in Formeln", async () => {
    const { view } = await setup();
    // `${}…{}$` statt `$…$` ist Absicht von Latex Suite (kein Flackern beim Tippen von Leerzeichen).
    type(view, "Sei mk");
    expect(view.state.doc.toString()).toBe("Sei ${}{}$");
    type(view, "@a sr");
    expect(view.state.doc.toString()).toBe("Sei ${}\\alpha^{2}{}$");
  });

  it("expandiert keine Text- und Formel-Snippets in Codeblöcken", async () => {
    const { view } = await setup();
    view.dispatch({ changes: { from: 0, insert: "```js\n\n```\n" }, selection: { anchor: 6 } });
    type(view, "mk @a");
    expect(view.state.doc.toString()).toBe("```js\nmk @a\n```\n");
    // Hinter dem Codeblock greifen die Snippets wieder.
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    type(view, "mk");
    expect(view.state.doc.toString()).toBe("```js\nmk @a\n```\n${}{}$");
  });

  it("erkennt Codeblöcke (Option c) und Inline-Code (Option C)", async () => {
    const { view, plugin } = await setup();
    plugin.settings.snippets = `[
      {trigger: "cb", replacement: "BLOCK", options: "cA"},
      {trigger: "ic", replacement: "INLINE", options: "CA"},
    ]`;
    // Zweites Argument: Snippets neu laden, wie nach einer Änderung im Einstellungsreiter.
    await plugin.saveSettings(false, true);
    view.dispatch({ changes: { from: 0, insert: "```js\n\n```\nText `` danach " }, selection: { anchor: 6 } });
    type(view, "cb ic");
    view.dispatch({ selection: { anchor: view.state.doc.toString().lastIndexOf("``") + 1 } });
    type(view, "x ic cb");
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    type(view, "cb ic");
    expect(view.state.doc.toString()).toBe("```js\nBLOCK ic\n```\nText `x INLINE cb` danach cb ic");
  });

  it("springt mit Tab zum nächsten Tabstop", async () => {
    const { view } = await setup();
    type(view, "mk//");
    expect(view.state.doc.toString()).toBe("${}\\frac{}{}{}$");
    type(view, "1");
    pressKey(view, "Tab");
    type(view, "2");
    expect(view.state.doc.toString()).toBe("${}\\frac{1}{2}{}$");
  });

  it("entfernt seine Editor-Erweiterungen beim Deaktivieren", async () => {
    const { view, plugin } = await setup();
    plugin.unload();
    type(view, "mk");
    expect(view.state.doc.toString()).toBe("mk");
  });
});
