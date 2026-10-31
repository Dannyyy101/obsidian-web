// @vitest-environment happy-dom
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { autoPair, type AutoPairSettings } from "../src/editor/auto-pair";
import { obsidianLezerExtensions } from "../src/markdown/syntax";

const ON: AutoPairSettings = { autoPairBrackets: true, autoPairMarkdown: true };

/** Editor mit `doc`: `|` ist der Cursor, `«`…`»` eine Auswahl. */
function editor(doc: string, settings = ON) {
  const anchor = doc.includes("«") ? doc.indexOf("«") : doc.indexOf("|");
  const head = doc.includes("«") ? doc.indexOf("»") - 1 : anchor;
  const view = new EditorView({
    parent: document.body.appendChild(document.createElement("div")),
    state: EditorState.create({
      doc: doc.replace(/[|«»]/g, ""),
      selection: { anchor, head },
      extensions: [autoPair(settings), markdown({ base: markdownLanguage, extensions: obsidianLezerExtensions })],
    }),
  });
  return view;
}

/** Tippt Zeichen für Zeichen wie über die Tastatur (Input-Handler zuerst, sonst einfügen). */
function type(view: EditorView, text: string) {
  for (const ch of text) {
    const { from, to } = view.state.selection.main;
    const insert = () => view.state.update({ changes: { from, to, insert: ch }, selection: { anchor: from + 1 }, userEvent: "input.type" });
    const handled = view.state.facet(EditorView.inputHandler).some((h) => h(view, from, to, ch, insert));
    if (!handled) view.dispatch(insert());
  }
}

function show(view: EditorView): string {
  const { anchor, head } = view.state.selection.main;
  const s = view.state.doc.toString();
  if (anchor === head) return s.slice(0, head) + "|" + s.slice(head);
  const [from, to] = [Math.min(anchor, head), Math.max(anchor, head)];
  return s.slice(0, from) + "«" + s.slice(from, to) + "»" + s.slice(to);
}

describe("Automatisch schließen", () => {
  it.each([
    ["|", "(", "(|)"],
    ["|", "[[", "[[|]]"],
    ["|", "{", "{|}"],
    ["|", "`", "`|`"],
    ["|", "(a)", "(a)|"],
    ["|", "[[x]]", "[[x]]|"],
  ])("%j + %j → %j", (doc, input, expected) => {
    const view = editor(doc);
    type(view, input);
    expect(show(view)).toBe(expected);
  });

  it("paart keine Anführungszeichen und keine Formatierungszeichen ohne Auswahl", () => {
    const view = editor("|");
    type(view, "\"Haus\" und 'Dach' *a _b ~c ==d $e");
    expect(show(view)).toBe("\"Haus\" und 'Dach' *a _b ~c ==d $e|");
  });

  it("umschließt eine Auswahl mit Formatierungszeichen und lässt sie ausgewählt", () => {
    const view = editor("ein «Wort» hier");
    type(view, "**");
    expect(show(view)).toBe("ein **«Wort»** hier");
    type(view, "==");
    expect(show(view)).toBe("ein **==«Wort»==** hier");
  });

  it("umschließt eine Auswahl mit Klammern", () => {
    const view = editor("«Notiz»");
    type(view, "[[");
    expect(show(view)).toBe("[[«Notiz»]]");
  });

  it("lässt sich über app.json abschalten", () => {
    const view = editor("ein «Wort»", { autoPairBrackets: false, autoPairMarkdown: false });
    type(view, "*");
    expect(show(view)).toBe("ein *|");
    type(view, "(");
    expect(show(view)).toBe("ein *(|");
  });
});
