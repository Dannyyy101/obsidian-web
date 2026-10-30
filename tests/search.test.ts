import { describe, expect, it } from "vitest";
import { parseQuery, searchFile } from "../src/core/search";

const NOTE = {
  path: "Uni/Theorie/Turing Maschine.md",
  basename: "Turing Maschine",
  content: "Eine Turing-Maschine hat ein Band.\nDas Band ist unendlich. Übergänge sind wichtig.",
  tags: ["#uni/theorie", "#wichtig"],
};

const search = (q: string, note = NOTE) => searchFile(parseQuery(q), note);

describe("Suche", () => {
  it("parst Operatoren", () => {
    expect(parseQuery('band -"leer" file:turing tag:#uni')).toEqual([
      { kind: "text", value: "band", negate: false },
      { kind: "text", value: "leer", negate: true },
      { kind: "file", value: "turing", negate: false },
      { kind: "tag", value: "#uni", negate: false },
    ]);
  });

  it("findet alle Wörter (UND) mit Positionen, unabhängig von Groß-/Kleinschreibung", () => {
    const r = search("BAND unendlich");
    expect(r?.matches.map(([a, b]) => NOTE.content.slice(a, b))).toEqual(["Band", "Band", "unendlich"]);
    expect(search("band fehlt")).toBeNull();
  });

  it("Phrasen, Ausschluss, Umlaute in NFD", () => {
    expect(search('"ist unendlich"')?.matches.length).toBe(1);
    expect(search("band -unendlich")).toBeNull();
    expect(search("übergänge", { ...NOTE, content: NOTE.content.normalize("NFD") })?.matches.length).toBe(1);
  });

  it("file:, path: und verschachtelte tag:", () => {
    expect(search("file:maschine")).not.toBeNull();
    expect(search("path:theorie band")).not.toBeNull();
    expect(search("tag:uni")).not.toBeNull(); // #uni/theorie liegt unter #uni
    expect(search("tag:theorie")).toBeNull();
    expect(search("-tag:wichtig")).toBeNull();
  });

  it("Treffer im Dateinamen zählen", () => {
    expect(search("maschine")?.inName).toBe(true);
  });
});
