// @vitest-environment happy-dom
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { foldedRanges } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { beforeAll, describe, expect, it } from "vitest";
import { foldAll, foldedLines, foldRangeAt, restoreFolds, toggleFold, unfoldAll, folding } from "../src/editor/folding";
import { obsidianLezerExtensions } from "../src/markdown/syntax";
import { installDomExtensions } from "../src/ui/dom";

const DOC = ["# Eins", "Text", "## Zwei", "- a", "\t- b", "\t- c", "- d", "", "# Drei", "Ende"].join("\n");

function editor(doc: string, config = { foldHeading: true, foldIndent: true }) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  return new EditorView({
    parent,
    state: EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage, extensions: obsidianLezerExtensions }), folding(config)] }),
  });
}

const line = (view: EditorView, n: number) => view.state.doc.line(n);
const slice = (view: EditorView, r: { from: number; to: number } | null) => (r ? view.state.sliceDoc(r.from, r.to) : null);

describe("Einklappen", () => {
  beforeAll(() => installDomExtensions());

  it("Überschriften bis vor die nächste gleich hohe oder höhere", () => {
    const view = editor(DOC);
    expect(slice(view, foldRangeAt(view.state, line(view, 1).from))).toBe("\nText\n## Zwei\n- a\n\t- b\n\t- c\n- d");
    expect(slice(view, foldRangeAt(view.state, line(view, 3).from))).toBe("\n- a\n\t- b\n\t- c\n- d");
    expect(foldRangeAt(view.state, line(view, 2).from)).toBeNull();
  });

  it("Listenpunkte mit Unterpunkten", () => {
    const view = editor(DOC);
    expect(slice(view, foldRangeAt(view.state, line(view, 4).from))).toBe("\n\t- b\n\t- c");
    expect(foldRangeAt(view.state, line(view, 5).from)).toBeNull();
    expect(foldRangeAt(view.state, line(view, 7).from)).toBeNull();
  });

  it("respektiert foldHeading und foldIndent", () => {
    const view = editor(DOC, { foldHeading: false, foldIndent: false });
    expect(foldRangeAt(view.state, line(view, 1).from)).toBeNull();
    expect(foldRangeAt(view.state, line(view, 4).from)).toBeNull();
  });

  it("Befehle: umschalten, alle ein- und ausklappen, wiederherstellen", () => {
    const view = editor(DOC);
    view.dispatch({ selection: { anchor: line(view, 5).from + 2 } });
    toggleFold(view);
    expect(foldedLines(view.state)).toEqual([4]);
    unfoldAll(view);
    expect(foldedRanges(view.state).size).toBe(0);
    foldAll(view);
    expect(foldedLines(view.state)).toEqual([1, 3, 4, 9]);
    const other = editor(DOC);
    restoreFolds(other, [3]);
    expect(foldedLines(other.state)).toEqual([3]);
    expect(view.contentDOM.querySelector(".cm-fold-indicator.is-collapsed")).not.toBeNull();
  });
});
