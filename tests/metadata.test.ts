import { describe, expect, it } from "vitest";
import { computeMetadata, getAllTags } from "../src/markdown/metadata";

const NOTE = `---
tags: [uni, "#theorie"]
related: "[[Grundlagen]]"
---
# Turing Maschine #wichtig
Siehe [[Automaten#Kellerautomat|PDA]] und [Band](Ordner/Band%20Notiz.md) und [Web](https://x.de).
![[Diagramm.png]]

## Übergang
- Punkt mit Link [[Zustand]] ^punkt
\`\`\`
[[kein Link]] #keintag
\`\`\`
Absatz mit Formel $[[x]]$ ende ^absatz`;

describe("computeMetadata", () => {
  const meta = computeMetadata(NOTE);

  it("Links mit Alias, Abschnitt und Markdown-Links (ohne externe, Code, Formeln)", () => {
    expect(meta.links?.map((l) => [l.link, l.displayText])).toEqual([
      ["Automaten#Kellerautomat", "PDA"],
      ["Ordner/Band Notiz.md", "Band"],
      ["Zustand", undefined],
    ]);
    const first = meta.links![0];
    expect(NOTE.slice(first.position.start.offset, first.position.end.offset)).toBe(first.original);
    expect(first.position.start.line).toBe(5);
  });

  it("Embeds, Tags, Überschriften, Blöcke", () => {
    expect(meta.embeds?.map((e) => e.link)).toEqual(["Diagramm.png"]);
    expect(meta.tags?.map((t) => t.tag)).toEqual(["#wichtig"]);
    expect(meta.headings?.map((h) => [h.heading, h.level])).toEqual([
      ["Turing Maschine #wichtig", 1],
      ["Übergang", 2],
    ]);
    expect(Object.keys(meta.blocks ?? {})).toEqual(["punkt", "absatz"]);
  });

  it("Frontmatter samt Tags und Links", () => {
    expect(meta.frontmatter?.related).toBe("[[Grundlagen]]");
    expect(meta.frontmatterLinks?.map((l) => [l.key, l.link])).toEqual([["related", "Grundlagen"]]);
    expect(getAllTags(meta)).toEqual(["#uni", "#theorie", "#wichtig"]);
    expect(meta.frontmatterPosition?.start.offset).toBe(0);
  });

  it("ungültiges YAML bricht nichts", () => {
    const m = computeMetadata("---\na: [unclosed\n---\n[[x]]");
    expect(m.frontmatter).toBeUndefined();
    expect(m.links?.[0].link).toBe("x");
  });
});
