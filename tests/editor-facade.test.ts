// @vitest-environment happy-dom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history } from "@codemirror/commands";
import { describe, expect, it } from "vitest";
import { Editor } from "../src/editor/editor";

function editor(doc: string) {
  const view = new EditorView({ state: EditorState.create({ doc, extensions: [history()] }) });
  return new Editor(view);
}

describe("Editor-Fassade", () => {
  it("rechnet zwischen Offsets und Zeile/Spalte um und begrenzt auf das Dokument", () => {
    const e = editor("ab\ncdef\n");
    expect(e.offsetToPos(4)).toEqual({ line: 1, ch: 1 });
    expect(e.posToOffset({ line: 1, ch: 1 })).toBe(4);
    expect(e.posToOffset({ line: 9, ch: 9 })).toBe(8);
    expect(e.offsetToPos(99)).toEqual({ line: 2, ch: 0 });
    expect(e.lineCount()).toBe(3);
    expect(e.lastLine()).toBe(2);
    expect(e.getLine(1)).toBe("cdef");
    expect(e.getLine(5)).toBe("");
  });

  it("setzt Cursor und Auswahl und liefert sie wie Obsidian", () => {
    const e = editor("Milch kaufen");
    e.setSelection({ line: 0, ch: 12 }, { line: 0, ch: 6 });
    expect(e.getSelection()).toBe("kaufen");
    expect(e.getCursor()).toEqual({ line: 0, ch: 6 });
    expect(e.getCursor("anchor")).toEqual({ line: 0, ch: 12 });
    expect(e.getCursor("from")).toEqual({ line: 0, ch: 6 });
    expect(e.somethingSelected()).toBe(true);
    e.setCursor(0, 5);
    expect(e.listSelections()).toEqual([{ anchor: { line: 0, ch: 5 }, head: { line: 0, ch: 5 } }]);
  });

  it("ersetzt Bereiche und Auswahl, mit Undo", () => {
    const e = editor("eins zwei");
    e.replaceRange("drei", { line: 0, ch: 5 }, { line: 0, ch: 9 });
    expect(e.getValue()).toBe("eins drei");
    e.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 4 });
    e.replaceSelection("[[eins]]");
    expect(e.getValue()).toBe("[[eins]] drei");
    expect(e.getRange({ line: 0, ch: 9 }, { line: 0, ch: 13 })).toBe("drei");
    e.undo();
    expect(e.getValue()).toBe("eins drei");
  });

  it("führt Transaktionen aus und setzt die Auswahl im neuen Dokument", () => {
    const e = editor("a\nb");
    e.transaction({
      changes: [{ from: { line: 0, ch: 0 }, text: "- " }, { from: { line: 1, ch: 0 }, text: "- " }],
      selection: { from: { line: 1, ch: 3 } },
    });
    expect(e.getValue()).toBe("- a\n- b");
    expect(e.getCursor()).toEqual({ line: 1, ch: 3 });
  });
});
