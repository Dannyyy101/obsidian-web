import type { Extension } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";

class InlineTitleWidget extends WidgetType {
  constructor(
    private title: string,
    private onRename: (name: string) => void,
  ) {
    super();
  }

  eq(other: InlineTitleWidget) {
    return other.title === this.title;
  }

  toDOM(view: EditorView) {
    // CodeMirror macht Widgets nicht editierbar; das innere Element ist es wieder.
    const wrap = createDiv("inline-title-wrapper");
    const el = wrap.createDiv({
      cls: "inline-title",
      text: this.title,
      attr: { contenteditable: "true", spellcheck: "false", autocapitalize: "on" },
    });
    const reset = () => el.setText(this.title);
    el.addEventListener("keydown", (evt) => {
      if (evt.isComposing) return;
      if (evt.key === "Enter" || evt.key === "ArrowDown") {
        evt.preventDefault();
        el.blur();
        view.dispatch({ selection: { anchor: 0 } });
        view.focus();
      } else if (evt.key === "Escape") {
        reset();
        el.blur();
      }
    });
    el.addEventListener("paste", (evt) => {
      evt.preventDefault();
      const text = evt.clipboardData?.getData("text/plain").replace(/\s*\n\s*/g, " ") ?? "";
      document.execCommand("insertText", false, text);
    });
    el.addEventListener("blur", () => {
      const name = (el.textContent ?? "").trim();
      if (name && name !== this.title) this.onRename(name);
      else reset();
    });
    return wrap;
  }

  ignoreEvent() {
    return true;
  }
}

/** Obsidians „Inline-Titel“: der Dateiname als editierbare Überschrift über dem Text. */
export function inlineTitle(title: string, onRename: (name: string) => void): Extension {
  const widget = Decoration.widget({ widget: new InlineTitleWidget(title, onRename), block: true, side: -1 });
  return EditorView.decorations.of(Decoration.set([widget.range(0)]));
}
