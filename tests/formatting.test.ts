import { EditorSelection, EditorState, type TransactionSpec } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  clearFormatting,
  insertCodeblock,
  insertLink,
  insertTable,
  insertWikilink,
  setHeading,
  toggleBlockquote,
  toggleBold,
  toggleBulletList,
  toggleChecklistStatus,
  toggleItalics,
  toggleNumberedList,
} from "../src/editor/formatting";
import type { EditorView } from "@codemirror/view";

/** Minimaler View-Ersatz: `|` markiert den Cursor, `«` … `»` eine Auswahl. */
function run(doc: string, command: (view: EditorView) => boolean): string {
  let anchor = doc.indexOf("«");
  let head: number;
  if (anchor >= 0) {
    head = doc.indexOf("»") - 1;
    doc = doc.replace("«", "").replace("»", "");
  } else {
    anchor = head = doc.indexOf("|");
    doc = doc.replace("|", "");
  }
  const view = {
    state: EditorState.create({ doc, selection: EditorSelection.single(anchor, head) }),
    dispatch(...specs: TransactionSpec[]) {
      this.state = this.state.update(...specs).state;
    },
  };
  command(view as unknown as EditorView);
  const { from, to } = view.state.selection.main;
  const text = view.state.doc.toString();
  return from === to ? `${text.slice(0, from)}|${text.slice(from)}` : `${text.slice(0, from)}«${text.slice(from, to)}»${text.slice(to)}`;
}

describe("Formatierungsbefehle", () => {
  it("fett: Auswahl umschließen und wieder entfernen", () => {
    expect(run("ein «Wort» hier", toggleBold)).toBe("ein **«Wort»** hier");
    expect(run("ein **«Wort»** hier", toggleBold)).toBe("ein «Wort» hier");
    expect(run("ein «**Wort**» hier", toggleBold)).toBe("ein «Wort» hier");
  });

  it("ohne Auswahl: Wort unter dem Cursor bzw. leeres Paar", () => {
    expect(run("ein Wo|rt", toggleBold)).toBe("ein **«Wort»**");
    expect(run("ein Wort|", toggleBold)).toBe("ein **«Wort»**");
    expect(run("ein |", toggleBold)).toBe("ein **|**");
  });

  it("kursiv schneidet nicht in fetten Text", () => {
    expect(run("**«x»**", toggleItalics)).toBe("***«x»***");
    expect(run("***«x»***", toggleItalics)).toBe("**«x»**");
  });

  it("Formatierung entfernen", () => {
    expect(run("«**a** *b* ==c== `d`»", clearFormatting)).toBe("«a b c d»");
  });

  it("Links einfügen", () => {
    expect(run("«Text»", insertLink)).toBe("[Text](|)");
    expect(run("«https://x.de»", insertLink)).toBe("[|](https://x.de)");
    expect(run("|", insertLink)).toBe("[|]()");
    expect(run("«Notiz»", (v) => insertWikilink(v))).toBe("[[«Notiz»]]");
    expect(run("|", (v) => insertWikilink(v, true))).toBe("![[|]]");
  });

  it("Überschriften setzen, wechseln und entfernen", () => {
    expect(run("Titel|", (v) => setHeading(v, 2))).toBe("## Titel|");
    expect(run("## Titel|", (v) => setHeading(v, 3))).toBe("### Titel|");
    expect(run("## Titel|", (v) => setHeading(v, 2))).toBe("Titel|");
    expect(run("## Titel|", (v) => setHeading(v, 0))).toBe("Titel|");
  });

  it("Listen, Zitate und Aufgaben umschalten", () => {
    expect(run("«a\nb»", toggleBulletList)).toBe("«- a\n- b»");
    expect(run("«- a\n- b»", toggleBulletList)).toBe("«a\nb»");
    expect(run("«a\n- b»", toggleNumberedList)).toBe("«1. a\n2. b»");
    expect(run("«a\nb»", toggleBlockquote)).toBe("«> a\n> b»");
    expect(run("a|", toggleChecklistStatus)).toBe("- [ ] a|");
    expect(run("- [ ] a|", toggleChecklistStatus)).toBe("- [x] a|");
    expect(run("\t- [x] a|", toggleChecklistStatus)).toBe("\t- [ ] a|");
    expect(run("- a|", toggleChecklistStatus)).toBe("- [ ] a|");
  });

  it("Blöcke in eigenen Zeilen einfügen", () => {
    expect(run("Text |", insertCodeblock)).toBe("Text \n\n```|\n\n```");
    expect(run("|", insertTable)).toBe("| | |  |\n| --- | --- |\n|  |  |");
  });
});
