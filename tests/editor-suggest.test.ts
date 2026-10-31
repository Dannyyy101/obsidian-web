// @vitest-environment happy-dom
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { beforeAll, describe, expect, it } from "vitest";
import type { App } from "../src/app/app";
import { MetadataCache } from "../src/core/metadata-cache";
import { Vault } from "../src/core/vault";
import { listEditing } from "../src/editor/lists";
import { editorSuggest, type EditorSuggest } from "../src/editor/suggest/editor-suggest";
import { LinkSuggest } from "../src/editor/suggest/link-suggest";
import { TagSuggest } from "../src/editor/suggest/tag-suggest";
import { obsidianLezerExtensions } from "../src/markdown/syntax";
import { IndexedAdapter } from "../src/storage/indexed-adapter";
import { MemoryBackend, MemoryTimesStore } from "../src/storage/memory-backend";
import { installDomExtensions } from "../src/ui/dom";

const FILES: Record<string, string> = {
  "Notiz.md": "---\naliases: [Spitzname]\n---\n# Einleitung\n## Teil: zwei\nAbsatz mit Block ^abc123\n\n#projekt",
  "Ordner/Notiz.md": "#Projekt #idee",
  "Ordner/Plan.md": "#projekt/alpha",
  "Bild.png": "",
};

async function setup() {
  const adapter = new IndexedAdapter("T", new MemoryBackend(), new MemoryTimesStore());
  for (const [path, text] of Object.entries(FILES)) await adapter.write(path, text);
  const vault = new Vault(adapter);
  await vault.load();
  const metadataCache = new MetadataCache(vault);
  await metadataCache.initialize();
  return { vault, metadataCache, getRecentFiles: () => ["Ordner/Plan.md"] } as unknown as App;
}

/** Editor mit `doc` (`|` = Cursor) und den Vorschlägen; `file` ist die geöffnete Notiz. */
function editor(app: App, doc: string, file = "Notiz.md") {
  const suggests = [new LinkSuggest(app), new TagSuggest(app)] as EditorSuggest<unknown>[];
  const view = new EditorView({
    parent: document.body.createDiv(),
    state: EditorState.create({
      doc: doc.replace("|", ""),
      selection: { anchor: doc.indexOf("|") },
      extensions: [
        markdown({ base: markdownLanguage, extensions: obsidianLezerExtensions }),
        editorSuggest(suggests, () => app.vault.getFileByPath(file)),
        listEditing({ useTab: true, tabSize: 4, smartIndentList: true }),
      ],
    }),
  });
  /** Tippt `text` wie der Nutzer (löst die Vorschläge aus). */
  const type = (text: string) => {
    const pos = view.state.selection.main.head;
    view.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length }, userEvent: "input.type" });
  };
  const key = (key: string) => view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  const text = () => {
    const pos = view.state.selection.main.head;
    const s = view.state.doc.toString();
    return s.slice(0, pos) + "|" + s.slice(pos);
  };
  return { view, type, key, text };
}

/** Titel der angezeigten Vorschläge (nach dem asynchronen Laden). */
async function titles(): Promise<string[]> {
  await new Promise((r) => setTimeout(r, 20));
  return [...document.querySelectorAll(".suggestion-container .suggestion-item")].map((el) => el.querySelector(".suggestion-title")!.textContent!);
}

describe("Vorschläge im Editor", () => {
  let app: App;
  beforeAll(async () => {
    installDomExtensions();
    app = await setup();
  });

  it("schlägt nach [[ Dateien vor, zuletzt geöffnete zuerst", async () => {
    const { type, view } = editor(app, "|");
    type("[[");
    const list = await titles();
    expect(list[0]).toBe("Plan");
    expect(list).toEqual(expect.arrayContaining(["Notiz", "Bild.png"]));
    view.destroy();
    expect(document.querySelector(".suggestion-container")).toBeNull();
  });

  it("fügt den kürzesten eindeutigen Linktext ein und schließt den Link", async () => {
    const { type, key, text, view } = editor(app, "Siehe |", "Ordner/Plan.md");
    type("[[pla");
    expect(await titles()).toEqual(["Plan"]);
    key("Enter");
    expect(text()).toBe("Siehe [[Plan]]|");
    type(" und [[Notiz");
    expect((await titles()).slice(0, 2)).toEqual(["Notiz", "Notiz"]);
    key("ArrowDown");
    key("Enter");
    // Zwei Dateien heißen „Notiz“: Der Linktext braucht dann den Pfad.
    expect(text()).toMatch(/\[\[(Notiz|Ordner\/Notiz)\]\]\|$/);
    view.destroy();
  });

  it("übernimmt vorhandene ]] statt sie zu verdoppeln", async () => {
    const { type, key, text, view } = editor(app, "|]]", "Ordner/Plan.md");
    type("[[Bild");
    await titles();
    key("Tab");
    expect(text()).toBe("[[Bild.png]]|");
    view.destroy();
  });

  it("schlägt Aliasse vor und fügt sie als Anzeigetext ein", async () => {
    const { type, key, text, view } = editor(app, "|", "Ordner/Plan.md");
    type("[[spitz");
    expect(await titles()).toEqual(["Spitzname"]);
    key("Enter");
    expect(text()).toBe("[[Notiz|Spitzname]]|");
    view.destroy();
  });

  it("schlägt nach # Überschriften und nach #^ Blöcke vor", async () => {
    const { type, key, text, view } = editor(app, "|");
    type("[[Notiz#");
    expect(await titles()).toEqual(["Einleitung", "Teil: zwei"]);
    type("zwei");
    key("Enter");
    expect(text()).toBe("[[Notiz#Teil zwei]]|");
    type(" [[#^");
    expect(await titles()).toEqual(["Absatz mit Block"]);
    key("Enter");
    expect(text()).toBe("[[Notiz#Teil zwei]] [[#^abc123]]|");
    view.destroy();
  });

  it("schlägt Tags vor, häufige zuerst, und hängt ein Leerzeichen an", async () => {
    const { type, key, text, view } = editor(app, "Text |");
    type("#");
    expect(await titles()).toEqual(["projekt", "idee", "projekt/alpha"]);
    type("alp");
    key("Enter");
    expect(text()).toBe("Text #projekt/alpha |");
    view.destroy();
  });

  it("schließt mit Escape und bleibt zu, bis der Auslöser endet", async () => {
    const { type, key, view } = editor(app, "|");
    type("#pro");
    expect((await titles()).length).toBeGreaterThan(0);
    key("Escape");
    type("j");
    expect(await titles()).toEqual([]);
    type(" #");
    expect((await titles()).length).toBeGreaterThan(0);
    view.destroy();
  });

  it("Enter und Tab übernehmen in Listen den Vorschlag statt die Liste fortzusetzen", async () => {
    const { type, key, text, view } = editor(app, "- |", "Ordner/Plan.md");
    type("[[pla");
    expect(await titles()).toEqual(["Plan"]);
    key("Enter");
    expect(text()).toBe("- [[Plan]]|");
    type(" #ide");
    expect(await titles()).toEqual(["idee"]);
    key("Tab");
    expect(text()).toBe("- [[Plan]] #idee |");
    view.destroy();
  });

  it("löst in Code, Überschriften und Frontmatter nichts aus", async () => {
    for (const [doc, input] of [["`|`", "[["], ["```\n|\n```", "#"], ["|", "# "], ["---\ntags: |\n---\n", "#"]]) {
      const { type, view } = editor(app, doc);
      type(input);
      expect(await titles()).toEqual([]);
      view.destroy();
    }
  });
});
