import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState, type StateCommand } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { continueList, indentList, listEditing, outdentList } from "../src/editor/lists";
import { obsidianLezerExtensions } from "../src/markdown/syntax";

/** Führt einen Befehl auf `doc` aus; `|` markiert den Cursor, `«`…`»` eine Auswahl. */
function run(doc: string, command: StateCommand, useTab = true): string | false {
  const anchor = doc.includes("«") ? doc.indexOf("«") : doc.indexOf("|");
  const head = doc.includes("«") ? doc.indexOf("»") - 1 : anchor;
  let state = EditorState.create({
    doc: doc.replace(/[|«»]/g, ""),
    selection: { anchor, head },
    extensions: [listEditing({ useTab, tabSize: 4, smartIndentList: true }), markdown({ base: markdownLanguage, extensions: obsidianLezerExtensions })],
  });
  const handled = command({ state, dispatch: (tr) => (state = tr.state) });
  if (!handled) return false;
  const pos = state.selection.main.head;
  const text = state.doc.toString();
  return text.slice(0, pos) + "|" + text.slice(pos);
}

describe("Listen fortsetzen (Enter)", () => {
  it.each([
    ["- a|", "- a\n- |"],
    ["* a|", "* a\n* |"],
    ["- [ ] a|", "- [ ] a\n- [ ] |"],
    ["- [x] erledigt|", "- [x] erledigt\n- [ ] |"],
    ["1. a|", "1. a\n2. |"],
    ["3) a|", "3) a\n4) |"],
    ["\t- a|", "\t- a\n\t- |"],
    ["> - a|", "> - a\n> - |"],
    ["> Zitat|", "> Zitat\n> |"],
    ["- a|b", "- a\n- |b"],
    ["- a\n\n- b|", "- a\n\n- b\n- |"],
  ])("%j → %j", (doc, expected) => expect(run(doc, continueList)).toBe(expected));

  it("nummeriert folgende Punkte weiter", () => {
    expect(run("1. a|\n2. b\n\t- x\n3. c\n\nText", continueList)).toBe("1. a\n2. |\n3. b\n\t- x\n4. c\n\nText");
  });

  it("beendet die Liste auf einem leeren Punkt", () => {
    expect(run("- a\n- |", continueList)).toBe("- a\n|");
    expect(run("- a\n- [ ] |", continueList)).toBe("- a\n|");
    expect(run("> a\n> |", continueList)).toBe("> a\n|");
  });

  it("rückt einen leeren Unterpunkt aus", () => {
    expect(run("- a\n\t- b\n\t- |", continueList)).toBe("- a\n\t- b\n- |");
    expect(run("- a\n        - |", continueList, false)).toBe("- a\n    - |");
  });

  it("überlässt normale Zeilen und Code dem Standard-Enter", () => {
    expect(run("Text|", continueList)).toBe(false);
    expect(run("|- a", continueList)).toBe(false);
    expect(run("```\n- a|\n```", continueList)).toBe(false);
    expect(run("---\ntags:\n  - a|\n---", continueList)).toBe(false);
  });
});

describe("Listen ein- und ausrücken (Tab, Shift+Tab)", () => {
  it("rückt den Punkt samt Unterpunkten ein", () => {
    expect(run("- a\n- b|\n\t- c\n- d", indentList)).toBe("- a\n\t- b|\n\t\t- c\n- d");
  });

  it("rückt mit Leerzeichen ein, wenn useTab aus ist", () => {
    expect(run("- a\n- b|", indentList, false)).toBe("- a\n    - b|");
  });

  it("rückt aus, auch im Zitat", () => {
    expect(run("- a\n\t- b|\n\t\t- c", outdentList)).toBe("- a\n- b|\n\t- c");
    expect(run("> - a\n> \t- b|", outdentList)).toBe("> - a\n> - b|");
  });

  it("fügt außerhalb von Listen einen Tabulator ein", () => {
    expect(run("ab|c", indentList)).toBe("ab\t|c");
  });

  it("rückt ausgewählte Zeilen ein", () => {
    expect(run("«a\nb»", indentList)).toMatch(/^\ta\n\tb/);
  });
});
