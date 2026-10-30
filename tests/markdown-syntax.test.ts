import { GFM, parser as baseParser } from "@lezer/markdown";
import { describe, expect, it } from "vitest";
import { obsidianLezerExtensions } from "../src/markdown/syntax";

const parser = baseParser.configure([GFM, ...obsidianLezerExtensions]);

/** Knoten als `Name:text`, ohne die Standard-Container. */
function nodes(doc: string, only?: string[]): string[] {
  const out: string[] = [];
  parser.parse(doc).iterate({
    enter: (n) => {
      if (only ? only.includes(n.name) : !["Document", "Paragraph"].includes(n.name)) {
        out.push(`${n.name}:${doc.slice(n.from, n.to)}`);
      }
    },
  });
  return out;
}

describe("Obsidian-Syntax (lezer)", () => {
  it("Wikilinks und Embeds", () => {
    expect(nodes("Siehe [[Notiz#Kapitel|Alias]] und ![[bild.png]].", ["Wikilink", "Embed", "WikilinkTarget"])).toEqual([
      "Wikilink:[[Notiz#Kapitel|Alias]]",
      "WikilinkTarget:Notiz#Kapitel|Alias",
      "Embed:![[bild.png]]",
      "WikilinkTarget:bild.png",
    ]);
  });

  it("keine Wikilinks über Zeilenenden oder ohne Inhalt", () => {
    expect(nodes("[[a\nb]] [[]]", ["Wikilink"])).toEqual([]);
  });

  it("Highlights", () => {
    expect(nodes("ein ==wichtiger== Satz", ["Highlight", "HighlightMark"])).toEqual([
      "Highlight:==wichtiger==",
      "HighlightMark:==",
      "HighlightMark:==",
    ]);
  });

  it("Tags, aber keine Überschriften, Zahlen oder #-im-Wort", () => {
    expect(nodes("#projekt/a text #2024 x#y #ä-b", ["Tag"])).toEqual(["Tag:#projekt/a", "Tag:#ä-b"]);
    expect(nodes("# Überschrift", ["Tag"])).toEqual([]);
  });

  it("Kommentare", () => {
    expect(nodes("sichtbar %%versteckt%% sichtbar", ["ObsidianComment"])).toEqual(["ObsidianComment:%%versteckt%%"]);
  });

  it("Frontmatter statt Setext-Überschrift", () => {
    const doc = "---\ntitle: Test\ntags: [a]\n---\n# Inhalt";
    expect(nodes(doc, ["Frontmatter", "SetextHeading2", "ATXHeading1"])).toEqual([
      "Frontmatter:---\ntitle: Test\ntags: [a]\n---",
      "ATXHeading1:# Inhalt",
    ]);
  });

  it("--- mitten im Dokument bleibt eine Trennlinie", () => {
    expect(nodes("Text\n\n---\n\nmehr", ["Frontmatter", "HorizontalRule"])).toEqual(["HorizontalRule:---"]);
  });
});

describe("LaTeX (lezer)", () => {
  const math = (doc: string) => nodes(doc, ["InlineMath", "BlockMath"]);

  it("Inline-Formeln", () => {
    expect(math("Es gilt $a^2 + b^2 = c^2$ und $x$.")).toEqual(["InlineMath:$a^2 + b^2 = c^2$", "InlineMath:$x$"]);
  });

  it("keine Formel bei Geldbeträgen, Leerraum oder Escapes", () => {
    expect(math("kostet $5 und $6")).toEqual([]);
    expect(math("$ a $")).toEqual([]);
    expect(math("\\$a$ und \\$")).toEqual([]);
    expect(math("$a\nb$")).toEqual([]);
  });

  it("$ vor einer Wikilink- oder Tag-Syntax bleibt Formel", () => {
    expect(math("$\\#x$")).toEqual(["InlineMath:$\\#x$"]);
  });

  it("$$ inline in einer Zeile", () => {
    expect(math("Text $$\\sum_i x_i$$ Text")).toEqual(["InlineMath:$$\\sum_i x_i$$"]);
  });

  it("mehrzeilige Blöcke, auch direkt nach einem Absatz", () => {
    const doc = "Absatz\n$$\n\\begin{aligned}\na &= b\n\\end{aligned}\n$$\nWeiter";
    expect(math(doc)).toEqual(["BlockMath:$$\n\\begin{aligned}\na &= b\n\\end{aligned}\n$$"]);
    expect(nodes(doc, ["Paragraph"])).toEqual(["Paragraph:Absatz", "Paragraph:Weiter"]);
  });

  it("einzeiliger Block und nicht geschlossener Block", () => {
    expect(math("$$ E = mc^2 $$")).toEqual(["BlockMath:$$ E = mc^2 $$"]);
    expect(math("$$\nx\ny")).toEqual(["BlockMath:$$\nx\ny"]);
  });

  it("$$ in Codeblöcken ist keine Formel", () => {
    expect(math("```\n$$\nx\n$$\n```")).toEqual([]);
  });
});
