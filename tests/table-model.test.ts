import { describe, expect, it } from "vitest";
import { escapeCell, formatTable, parseTable } from "../src/editor/render/table";

describe("Tabellenmodell", () => {
  it("liest Zellen samt Position und Ausrichtung", () => {
    const source = "| A | B |\n|---|:-:|\n| x `a|b` | y\\|z |";
    const model = parseTable(source);
    expect(model.align).toEqual(["", "center"]);
    expect(model.rows.map((r) => r.map((c) => c.text))).toEqual([["A", "B"], ["x `a|b`", "y\\|z"]]);
    for (const row of model.rows) for (const c of row) expect(source.slice(c.from, c.to)).toBe(c.text);
  });

  it("Tabellen ohne äußere Striche, leere Zellen und Zitate", () => {
    const model = parseTable("> A | B\n> --|--\n> 1 |");
    expect(model.prefix).toBe("> ");
    expect(model.rows.map((r) => r.map((c) => c.text))).toEqual([["A", "B"], ["1"]]);
    const empty = parseTable("| A |  |\n|---|---|\n|  | b |");
    expect(empty.rows[1].map((c) => c.text)).toEqual(["", "b"]);
    expect(empty.rows[1][0].from).toBe("| A |  |\n|---|---|\n| ".length);
  });

  it("schreibt Tabellen neu", () => {
    expect(formatTable([["A", "B"], ["1"]], ["left", "right"], "", ["^id"])).toBe("| A | B |\n| :-- | --: |\n| 1 |  |\n^id");
    expect(escapeCell("a|b \\| c\n")).toBe("a\\|b \\| c");
  });
});
