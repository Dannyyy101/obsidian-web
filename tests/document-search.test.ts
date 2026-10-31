// @vitest-environment happy-dom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { beforeAll, describe, expect, it } from "vitest";
import { documentSearch, openDocumentSearch } from "../src/editor/document-search";
import { installDomExtensions } from "../src/ui/dom";

function editor(doc: string, anchor = 0, head = anchor) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  return new EditorView({ parent, state: EditorState.create({ doc, selection: { anchor, head }, extensions: [documentSearch()] }) });
}

function type(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event("input"));
}

function key(input: HTMLInputElement, key: string, init: KeyboardEventInit = {}) {
  input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
}

describe("Suchen & Ersetzen in der Notiz", () => {
  beforeAll(() => installDomExtensions());

  it("zählt Treffer und springt mit Enter weiter", () => {
    const view = editor("Apfel Birne apfel Apfel");
    openDocumentSearch(view);
    const input = view.dom.querySelector<HTMLInputElement>(".document-search-input")!;
    const count = view.dom.querySelector(".document-search-count")!;
    type(input, "apfel");
    expect(count.textContent).toBe("– / 3");
    key(input, "Enter");
    expect(view.state.selection.main.from).toBe(0);
    expect(count.textContent).toBe("1 / 3");
    key(input, "Enter");
    expect(view.state.selection.main.from).toBe(12);
    key(input, "Enter", { shiftKey: true });
    expect(view.state.selection.main.from).toBe(0);
  });

  it("beachtet auf Wunsch Groß-/Kleinschreibung", () => {
    const view = editor("Apfel apfel");
    openDocumentSearch(view);
    type(view.dom.querySelector<HTMLInputElement>(".document-search-input")!, "Apfel");
    view.dom.querySelector<HTMLElement>('[aria-label="Groß-/Kleinschreibung beachten"]')!.click();
    expect(view.dom.querySelector(".document-search-count")!.textContent).toBe("– / 1");
  });

  it("übernimmt die Auswahl als Suchbegriff und ersetzt alle Treffer", () => {
    const view = editor("eins zwei eins", 0, 4);
    openDocumentSearch(view, true);
    expect(view.dom.querySelector<HTMLInputElement>(".document-search-input")!.value).toBe("eins");
    const replace = view.dom.querySelector<HTMLInputElement>(".document-replace-input")!;
    expect(replace.parentElement!.style.display).not.toBe("none");
    type(replace, "drei");
    [...view.dom.querySelectorAll<HTMLButtonElement>(".document-replace-button")].find((b) => b.textContent === "Alle ersetzen")!.click();
    expect(view.state.doc.toString()).toBe("drei zwei drei");
  });

  it("Escape schließt die Leiste", () => {
    const view = editor("x");
    openDocumentSearch(view);
    key(view.dom.querySelector<HTMLInputElement>(".document-search-input")!, "Escape");
    expect(view.dom.querySelector(".document-search-container")).toBeNull();
  });
});
