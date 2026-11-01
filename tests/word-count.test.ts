// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { App } from "../src/app/app";
import { Vault } from "../src/core/vault";
import { countWords } from "../src/plugins/word-count/count";
import { IndexedAdapter } from "../src/storage/indexed-adapter";
import { MemoryBackend, MemoryTimesStore } from "../src/storage/memory-backend";
import { installDomExtensions } from "../src/ui/dom";

describe("countWords", () => {
  it("zählt Wörter und Zeichen ohne Zeilenumbrüche", () => {
    expect(countWords("Hallo Welt\nzweite Zeile")).toEqual({ words: 4, characters: 22 });
    expect(countWords("")).toEqual({ words: 0, characters: 0 });
  });

  it("lässt Frontmatter und Kommentare aus", () => {
    expect(countWords("---\ntags: [a, b]\ntitle: Viele Wörter hier\n---\nNur das")).toEqual({ words: 2, characters: 7 });
    expect(countWords("eins %%geheim%% zwei <!-- auch -->").words).toBe(2);
  });

  it("lässt Markdown-Syntax aus", () => {
    expect(countWords("# Titel")).toEqual({ words: 1, characters: 5 });
    expect(countWords("- [ ] **fett** und *kursiv*")).toEqual({ words: 3, characters: 15 });
    expect(countWords("> [!note] Hinweis\n> Text")).toEqual({ words: 2, characters: 11 });
    expect(countWords("1. ==markiert== ~~weg~~ `code`").words).toBe(3);
    expect(countWords("```js\nlet a\n```\n---")).toEqual({ words: 2, characters: 5 });
    expect(countWords("| a | b |\n| --- | --- |\n| c | d |").words).toBe(4);
    expect(countWords("Satz ^block-id").words).toBe(1);
  });

  it("zählt bei Links nur den sichtbaren Text", () => {
    expect(countWords("[[Ziel|Anzeige Text]]").words).toBe(2);
    expect(countWords("[[Notiz#Abschnitt]]").words).toBe(2);
    expect(countWords("![[Bild.png]] [Text](https://example.com/a b) ![alt](x.png)")).toEqual({ words: 1, characters: 4 });
    expect(countWords("Fußnote[^1]")).toEqual({ words: 1, characters: 7 });
  });

  it("zählt Satzzeichen nicht als Wort, Bindestrich- und snake_case-Wörter als eines", () => {
    expect(countWords("eins – zwei !").words).toBe(2);
    expect(countWords("E-Mail snake_case _kursiv_ 42").words).toBe(4);
  });

  it("zählt chinesische und japanische Zeichen einzeln", () => {
    expect(countWords("你好世界").words).toBe(4);
    expect(countWords("こんにちは world").words).toBe(6);
  });
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Core-Plugin Wortzählung", () => {
  beforeAll(() => installDomExtensions());

  async function setup(files: Record<string, string>) {
    const adapter = new IndexedAdapter(`WC${Math.random()}`, new MemoryBackend(), new MemoryTimesStore());
    for (const [path, text] of Object.entries(files)) await adapter.write(path, text);
    const vault = new Vault(adapter);
    await vault.load();
    const root = document.createElement("div");
    document.body.appendChild(root);
    const app = new App(vault, root);
    await app.workspace.restoreLayout();
    const item = () => app.workspace.statusBarEl.querySelector<HTMLElement>(".plugin-word-count")!;
    return { app, vault, item };
  }

  it("zeigt die Zählung der aktiven Notiz und folgt Änderungen, Auswahl und Tabwechsel", async () => {
    const { app, vault, item } = await setup({ "A.md": "---\na: 1\n---\nEin Wort", "B.md": "drei kleine Wörter" });
    expect(item().style.display).toBe("none");

    await app.openFileAt(vault.getFileByPath("A.md")!);
    expect(item().textContent).toBe("2 Wörter8 Zeichen");
    expect(item().style.display).not.toBe("none");

    const { editor } = app.editor;
    // happy-dom meldet sonst bei fokussiertem Editor `selectionchange` mitten im CodeMirror-Update.
    editor.cm.contentDOM.blur();
    editor.replaceRange(" mehr", editor.offsetToPos(editor.getValue().length));
    await tick();
    expect(item().textContent).toBe("3 Wörter13 Zeichen");

    const start = editor.getValue().indexOf("Wort");
    editor.setSelection(editor.offsetToPos(start), editor.offsetToPos(start + 4));
    await tick();
    expect(item().textContent).toBe("1 Wort4 Zeichen");
    expect(item().hasClass("mod-selection")).toBe(true);

    await app.openFileAt(vault.getFileByPath("B.md")!, undefined, undefined, true);
    expect(item().textContent).toBe("3 Wörter18 Zeichen");
    app.workspace.setActiveLeaf(app.workspace.leaves[0]);
    expect(item().textContent).toBe("1 Wort4 Zeichen");
  });
});
