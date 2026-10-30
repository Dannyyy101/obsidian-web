// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import type { LivePreviewHost } from "../src/editor/live-preview/host";
import type { RenderContext } from "../src/editor/render/context";
import { renderMarkdown } from "../src/editor/render/markdown";
import { installDomExtensions } from "../src/ui/dom";

const NOTES: Record<string, string> = {
  "Andere.md": "# Andere\nEinleitung\n## Teil\nInhalt vom Teil ^blk\n## Ende\nSchluss",
  "Selbst.md": "Ich: ![[Selbst]]",
};

const host: LivePreviewHost = {
  openLink: () => {},
  isResolved: (link) => `${link}.md` in NOTES,
  loadResource: async () => null,
  loadNote: async (link) => {
    const path = `${link}.md`;
    return path in NOTES ? { path, content: NOTES[path] } : null;
  },
};

function render(source: string, extra: Partial<RenderContext> = {}) {
  const el = document.createElement("div");
  renderMarkdown(source, el, { host, sourcePath: "Start.md", depth: 0, embedded: new Set(), ...extra });
  return el;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("Markdown-Renderer", () => {
  beforeAll(() => installDomExtensions());

  it("Überschriften, Absätze mit Zeilenumbruch, Formatierung", () => {
    const el = render("# Titel\nZeile 1\nZeile **2** und ==x==");
    expect(el.querySelector("h1")?.textContent).toBe("Titel");
    expect(el.querySelector("p")?.innerHTML).toBe("Zeile 1<br>Zeile <strong>2</strong> und <mark>x</mark>");
  });

  it("Listen, verschachtelt, mit Aufgaben", () => {
    const el = render("- a\n  - b\n- [x] erledigt\n\n3. drei\n4. vier");
    expect(el.querySelectorAll("ul > li").length).toBe(3);
    expect(el.querySelector("ul ul li")?.textContent).toBe("b");
    const task = el.querySelector("li.task-list-item.is-checked")!;
    expect(task.textContent).toBe("erledigt");
    expect((task.querySelector("input") as HTMLInputElement).checked).toBe(true);
    expect(el.querySelector("ol")?.getAttribute("start")).toBe("3");
  });

  it("Aufgaben lassen sich umschalten, wenn toggleTask gesetzt ist", () => {
    const calls: [number, boolean][] = [];
    const source = "Text\n- [ ] offen";
    const el = render(source, { toggleTask: (offset, checked) => calls.push([offset, checked]) });
    (el.querySelector("input") as HTMLInputElement).click();
    expect(calls).toEqual([[source.indexOf("[ ]"), false]]);
  });

  it("Callouts mit Typ, Titel, Einklappen und Markdown-Inhalt", () => {
    const el = render("> [!warning]- Achtung **hier**\n> Inhalt mit [[Andere]]\n> - Punkt");
    const callout = el.querySelector(".callout")!;
    expect(callout.getAttribute("data-callout")).toBe("warning");
    expect(callout.classList.contains("is-collapsed")).toBe(true);
    expect(callout.querySelector(".callout-title-inner")?.innerHTML).toBe("Achtung <strong>hier</strong>");
    expect(callout.querySelector(".callout-content a.internal-link")?.textContent).toBe("Andere");
    expect(callout.querySelector(".callout-content li")?.textContent).toBe("Punkt");
    (callout.querySelector(".callout-title") as HTMLElement).click();
    expect(callout.classList.contains("is-collapsed")).toBe(false);
  });

  it("Callout ohne Titel heißt wie sein Typ; normales Zitat bleibt Zitat", () => {
    expect(render("> [!tip]\n> x").querySelector(".callout-title-inner")?.textContent).toBe("Tip");
    expect(render("> nur ein Zitat").querySelector("blockquote p")?.textContent).toBe("nur ein Zitat");
  });

  it("Codeblöcke, Tabellen, Trennlinie", () => {
    const el = render("```js\nlet a = 1;\n```\n\n| A | B |\n|---|---|\n| 1 | `2` |\n\n---");
    expect(el.querySelector("pre code.language-js")?.textContent).toBe("let a = 1;");
    expect([...el.querySelectorAll("td")].map((td) => td.innerHTML)).toEqual(["1", "<code>2</code>"]);
    expect(el.querySelector("hr")).not.toBeNull();
  });

  it("bettet Notizabschnitte und Blöcke ein und erkennt Zyklen", async () => {
    const el = render("![[Andere#Teil]]\n\n![[Andere#^blk]]\n\n![[Fehlt]]\n\n![[Selbst]]");
    await flush();
    await flush();
    const embeds = [...el.querySelectorAll(".markdown-embed-content")].map((e) => e.textContent);
    expect(embeds[0]).toBe("TeilInhalt vom Teil");
    expect(embeds[1]).toBe("Inhalt vom Teil");
    expect(embeds[2]).toContain("nicht gefunden");
    expect(embeds[3]).toContain("Ich:");
    expect(el.textContent).toContain("bettet sich selbst ein");
  });

  it("Frontmatter und Block-IDs werden nicht angezeigt", () => {
    const el = render("---\ntags: [a]\n---\nText ^abc");
    expect(el.textContent).toBe("Text");
  });
});
