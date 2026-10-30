import { describe, expect, it } from "vitest";
import { fuzzyMatch } from "../src/shared/fuzzy";

const rank = (query: string, targets: string[]) =>
  targets
    .map((t) => ({ t, m: fuzzyMatch(query, t) }))
    .filter((x) => x.m)
    .sort((a, b) => b.m!.score - a.m!.score)
    .map((x) => x.t);

describe("fuzzyMatch", () => {
  it("verlangt alle Zeichen in Reihenfolge, unabhängig von Groß-/Kleinschreibung", () => {
    expect(fuzzyMatch("tm", "Turing Maschine")?.matches).toEqual([0, 7]);
    expect(fuzzyMatch("mt", "Turing Maschine")).toBeNull();
  });

  it("findet Umlaute auch in NFD-Schreibweise", () => {
    expect(fuzzyMatch("bina", "Binäre Addition".normalize("NFD"))).not.toBeNull();
    expect(fuzzyMatch("binä", "Binäre Addition".normalize("NFD"))).not.toBeNull();
  });

  it("bevorzugt zusammenhängende Treffer und Wortanfänge", () => {
    expect(rank("turing", ["Uni/Theorie/Notizen zu Turing.md", "Turing.md", "t-u-r-i-n-g.md"])).toEqual([
      "Turing.md",
      "Uni/Theorie/Notizen zu Turing.md",
      "t-u-r-i-n-g.md",
    ]);
    expect(rank("ebk", ["Uni/EBK/Index.md", "Erste Bank Konto.md", "Webkatalog.md"])[0]).toBe("Uni/EBK/Index.md");
  });
});
