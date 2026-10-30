import { describe, expect, it } from "vitest";
import { extractSection } from "../src/markdown/sections";

const NOTE = `---
tags: [a]
---
Intro

# Kapitel 1
Text 1
## Unter A
Text A
## Unter B
Text B
# Kapitel 2
\`\`\`
# kein Heading
\`\`\`
Absatz mit Ziel
zweite Zeile ^abc

- Punkt 1 ^p1
  - Kind
- Punkt 2

| a | b |
|---|---|
| 1 | 2 |
^tab`;

describe("extractSection", () => {
  it("ganze Notiz ohne Frontmatter", () => {
    expect(extractSection(NOTE, "")?.startsWith("Intro")).toBe(true);
  });

  it("Überschrift bis zur nächsten gleich- oder höherrangigen", () => {
    expect(extractSection(NOTE, "#Kapitel 1")).toBe("# Kapitel 1\nText 1\n## Unter A\nText A\n## Unter B\nText B");
    expect(extractSection(NOTE, "#unter a")).toBe("## Unter A\nText A");
  });

  it("verschachtelter Pfad und Überschriften in Codeblöcken", () => {
    expect(extractSection(NOTE, "#Kapitel 1#Unter B")).toBe("## Unter B\nText B");
    expect(extractSection(NOTE, "#kein Heading")).toBeNull();
    expect(extractSection(NOTE, "#Kapitel 2")?.split("\n")[0]).toBe("# Kapitel 2");
  });

  it("Blöcke: Absatz, Listenpunkt mit Kindern, Tabelle mit eigener ^id-Zeile", () => {
    expect(extractSection(NOTE, "#^abc")).toBe("Absatz mit Ziel\nzweite Zeile");
    expect(extractSection(NOTE, "#^p1")).toBe("- Punkt 1\n  - Kind");
    expect(extractSection(NOTE, "#^tab")).toBe("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(extractSection(NOTE, "#^fehlt")).toBeNull();
  });
});
