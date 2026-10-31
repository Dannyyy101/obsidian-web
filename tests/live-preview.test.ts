// @vitest-environment happy-dom
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { beforeAll, describe, expect, it } from "vitest";
import { livePreview } from "../src/editor/live-preview/decorations";
import { loadKatex } from "../src/editor/render/math";
import type { LivePreviewHost } from "../src/editor/live-preview/host";
import { obsidianLezerExtensions } from "../src/markdown/syntax";
import { installDomExtensions } from "../src/ui/dom";

const host: LivePreviewHost = {
  openLink: () => {},
  isResolved: (link) => link === "Notiz",
  loadResource: async () => null,
  loadNote: async (link) => (link === "Notiz" ? { path: "Notiz.md", content: "# Notiz\nEingebetteter **Text**" } : null),
};

function editor(doc: string, cursor: number) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [markdown({ base: markdownLanguage, extensions: obsidianLezerExtensions }), livePreview(host)],
    }),
  });
}

/** Sichtbarer Text einer Zeile (1-basiert). */
function lineText(view: EditorView, n: number): string {
  return (view.contentDOM.querySelectorAll(".cm-line")[n - 1] as HTMLElement).textContent ?? "";
}

const DOC = ["# Titel", "**fett** und ==markiert==", "Link: [[Notiz|Alias]] und [Web](https://x.de)", "- [ ] Aufgabe", "- Punkt", "Ende"].join("\n");

describe("Live Preview", () => {
  beforeAll(() => installDomExtensions());

  it("blendet die Syntax aus, wo der Cursor nicht ist", () => {
    const view = editor(DOC, DOC.length);
    expect(lineText(view, 1)).toBe("Titel");
    expect(lineText(view, 2)).toBe("fett und markiert");
    expect(lineText(view, 3)).toBe("Link: Alias und Web");
    expect(view.contentDOM.querySelector(".task-list-item-checkbox")).not.toBeNull();
    expect(lineText(view, 4)).toBe("Aufgabe");
    expect(lineText(view, 5)).toBe("Punkt");
    expect(view.contentDOM.querySelector(".list-bullet")).not.toBeNull();
  });

  it("zeigt die Syntax des Elements unter dem Cursor", () => {
    const boldPos = DOC.indexOf("fett") + 2;
    const view = editor(DOC, boldPos);
    expect(lineText(view, 2)).toBe("**fett** und markiert"); // nur das berührte Element
    expect(lineText(view, 1)).toBe("Titel");
  });

  it("zeigt die Überschriften-Markierung, wenn der Cursor in der Zeile steht", () => {
    const view = editor(DOC, 3);
    expect(lineText(view, 1)).toBe("# Titel");
  });

  it("zeigt Wikilinks im Quelltext, sobald der Cursor sie berührt", () => {
    const view = editor(DOC, DOC.indexOf("Alias"));
    expect(lineText(view, 3)).toBe("Link: [[Notiz|Alias]] und Web");
  });

  it("rendert Tabellen als Widget, außer der Cursor steht darin", () => {
    const table = "Text\n\n| A | B |\n|---|:-:|\n| **x** | [[y]] |\n\nEnde";
    const outside = editor(table, 0);
    const cells = [...outside.contentDOM.querySelectorAll(".cm-table-widget td")].map((td) => td.textContent);
    expect(cells).toEqual(["x", "y"]);
    const inside = editor(table, table.indexOf("| A"));
    expect(inside.contentDOM.querySelector(".cm-table-widget")).toBeNull();
  });

  it("Tabellen-Editor: Zelle bearbeiten schreibt nur diese Zelle in die Quelle", () => {
    const table = "Text\n\n|  A  | B |\n|---|:-:|\n| **x** | y |\n\nEnde";
    const view = editor(table, 0);
    const cell = view.contentDOM.querySelector<HTMLElement>('.table-cell-wrapper[data-row="1"][data-col="0"]')!;
    expect(cell.innerHTML).toBe("<strong>x</strong>");
    cell.focus();
    cell.dispatchEvent(new FocusEvent("focus"));
    expect(cell.textContent).toBe("**x**");
    cell.textContent = "**neu** | z";
    cell.dispatchEvent(new FocusEvent("blur"));
    expect(view.state.doc.toString()).toBe("Text\n\n|  A  | B |\n|---|:-:|\n| **neu** \\| z | y |\n\nEnde");
    expect(cell.innerHTML).toBe("<strong>neu</strong> | z");
  });

  it("Fußnoten: Verweis hochgestellt mit Definition als Tooltip, Inline-Fußnote ohne Klammern", () => {
    const doc = "Text[^1] und ^[nebenbei].\n\n[^1]: Die Quelle";
    const view = editor(doc, doc.length);
    const ref = view.contentDOM.querySelector<HTMLElement>("sup.footnote-ref")!;
    expect(ref.textContent).toBe("[1]");
    expect(ref.title).toBe("Die Quelle");
    expect(lineText(view, 1)).toBe("Text[1] und nebenbei.");
    expect(view.contentDOM.querySelector(".HyperMD-footnote .cm-footref")?.textContent).toBe("[^1]:");
    const inside = editor(doc, doc.indexOf("[^1]") + 1);
    expect(lineText(inside, 1)).toBe("Text[^1] und nebenbei.");
  });

  describe("LaTeX", () => {
    beforeAll(async () => {
      // KaTeX rendert nicht im Quirks-Modus; die App hat einen Doctype, happy-dom meldet ihn nicht.
      Object.defineProperty(document, "compatMode", { value: "CSS1Compat", configurable: true });
      await loadKatex();
    });

    const MATH = ["Es gilt $a^2+b^2=c^2$ immer.", "$$", "\\int_0^1 x\\,dx", "$$", "Ende"].join("\n");

    it("rendert Inline- und Blockformeln mit KaTeX, wenn der Cursor woanders steht", () => {
      const view = editor(MATH, MATH.length);
      expect(view.contentDOM.querySelectorAll(".math-inline .katex").length).toBe(1);
      expect(view.contentDOM.querySelectorAll(".math-block .katex-display").length).toBe(1);
      expect(view.contentDOM.textContent).not.toContain("$");
    });

    it("zeigt die Quelle der Formel unter dem Cursor", () => {
      const view = editor(MATH, MATH.indexOf("a^2"));
      expect(lineText(view, 1)).toBe("Es gilt $a^2+b^2=c^2$ immer.");
      expect(view.contentDOM.querySelectorAll(".math-block").length).toBe(1); // Block bleibt gerendert
    });

    it("zeigt den Block als Quelle, wenn der Cursor darin steht", () => {
      const view = editor(MATH, MATH.indexOf("\\int"));
      expect(view.contentDOM.querySelector(".math-block")).toBeNull();
      expect(lineText(view, 3)).toBe("\\int_0^1 x\\,dx");
    });

    it("zeigt fehlerhafte Formeln rot statt abzustürzen", () => {
      const doc = "$\\frac{1}{$ x";
      const view = editor(doc + "\nEnde", doc.length + 3);
      expect(view.contentDOM.querySelector(".katex-error, .math-error")).not.toBeNull();
    });
  });

  describe("Callouts und Embeds", () => {
    const DOC = ["Vorher", "", "> [!tip] Merke", "> Inhalt", "", "![[Notiz]]", "", "Ende"].join("\n");

    it("rendert Callouts als Block, außer der Cursor steht darin", () => {
      const outside = editor(DOC, 0);
      const callout = outside.contentDOM.querySelector(".callout[data-callout='tip']");
      expect(callout?.querySelector(".callout-title-inner")?.textContent).toBe("Merke");
      expect(callout?.querySelector(".callout-content")?.textContent).toBe("Inhalt");
      const inside = editor(DOC, DOC.indexOf("Inhalt"));
      expect(inside.contentDOM.querySelector(".callout")).toBeNull();
      expect(lineText(inside, 3)).toBe("> [!tip] Merke");
    });

    it("bettet Notizen ein", async () => {
      const view = editor(DOC, 0);
      await new Promise((r) => setTimeout(r, 0));
      const content = view.contentDOM.querySelector(".markdown-embed-content");
      expect(content?.querySelector("h1")?.textContent).toBe("Notiz");
      expect(content?.querySelector("p")?.innerHTML).toBe("Eingebetteter <strong>Text</strong>");
    });
  });

  it("zeigt bei Codeblöcken Sprache und Kopieren-Knopf statt der Zaunzeile", () => {
    const doc = "Text\n```js\nlet a = 1;\n```\nEnde";
    const view = editor(doc, doc.length);
    expect(view.contentDOM.querySelector(".code-block-flair-lang")?.textContent).toBe("js");
    expect(view.contentDOM.querySelector(".code-block-flair")?.textContent).toBe("Kopieren");
    const cursorInside = editor(doc, doc.indexOf("let"));
    expect(cursorInside.contentDOM.querySelector(".code-block-flair")).toBeNull();
    expect(lineText(cursorInside, 2)).toBe("```js");
  });
});
