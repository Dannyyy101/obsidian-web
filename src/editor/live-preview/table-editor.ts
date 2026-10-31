import { type EditorView, WidgetType } from "@codemirror/view";
import { Menu } from "../../ui/menu";
import { setIcon } from "../../ui/icons";
import type { RenderContext } from "../render/context";
import { renderInline } from "../render/inline";
import { escapeCell, formatTable, parseTable, type TableAlign, type TableModel } from "../render/table";
import { followLink } from "./widgets";
import type { LivePreviewHost } from "./host";

interface CellRef {
  row: number;
  col: number;
}

/** Zustand am DOM des Widgets, damit er ein Neuzeichnen nach eigenen Änderungen übersteht. */
interface TableDom extends HTMLElement {
  tableSource?: string;
  /** Zelle, die nach dem nächsten Neuzeichnen den Fokus bekommt. */
  pendingFocus?: CellRef & { atEnd?: boolean };
}

/**
 * Tabellen-Editor der Live Preview wie in Obsidian: Zellen werden direkt in der gerenderten
 * Tabelle bearbeitet. Eine Zelle zeigt beim Bearbeiten ihr Markdown, sonst die Darstellung.
 * Tab/Umschalt+Tab und Enter wechseln die Zelle, das Kontextmenü fügt Zeilen und Spalten ein.
 */
export class TableEditorWidget extends WidgetType {
  constructor(
    private source: string,
    private host: LivePreviewHost,
  ) {
    super();
  }

  eq(other: TableEditorWidget) {
    return other.source === this.source;
  }

  toDOM(view: EditorView) {
    const dom: TableDom = createDiv("cm-table-widget cm-table-editor");
    this.build(dom, view);
    return dom;
  }

  /** Gleiche Art Widget mit neuer Quelle: DOM weiterverwenden, damit der Fokus erhalten bleibt. */
  updateDOM(dom: TableDom, view: EditorView) {
    if (dom.tableSource !== this.source) this.build(dom, view);
    else dom.tableSource = this.source;
    return true;
  }

  ignoreEvent() {
    return true;
  }

  ignoreMutation() {
    return true;
  }

  private context(): RenderContext {
    return { host: this.host, sourcePath: "", depth: 1, embedded: new Set() };
  }

  private build(dom: TableDom, view: EditorView) {
    const model = parseTable(this.source);
    dom.empty();
    dom.tableSource = this.source;
    const wrapper = dom.createDiv("table-wrapper");
    const table = wrapper.createEl("table");
    const columns = Math.max(model.align.length, ...model.rows.map((r) => r.length));
    model.rows.forEach((cells, row) => {
      const parent = row === 0 ? table.createEl("thead") : (table.tBodies[0] ?? table.createEl("tbody"));
      const tr = parent.createEl("tr");
      for (let col = 0; col < columns; col++) {
        const cell = tr.createEl(row === 0 ? "th" : "td");
        if (model.align[col]) cell.style.textAlign = model.align[col];
        const content = cell.createDiv({ cls: "table-cell-wrapper", attr: { contenteditable: "true", spellcheck: "true" } });
        content.dataset.row = String(row);
        content.dataset.col = String(col);
        this.showRendered(content, cells[col]?.text ?? "");
        this.bindCell(content, { row, col }, view, dom);
      }
    });

    const addRow = wrapper.createDiv({ cls: "table-row-btn clickable-icon", attr: { "aria-label": "Zeile hinzufügen" } });
    setIcon(addRow, "plus");
    addRow.addEventListener("mousedown", (evt) => {
      evt.preventDefault();
      this.change(view, dom, (rows) => rows.push([]), { row: model.rows.length, col: 0 });
    });
    const addCol = wrapper.createDiv({ cls: "table-col-btn clickable-icon", attr: { "aria-label": "Spalte hinzufügen" } });
    setIcon(addCol, "plus");
    addCol.addEventListener("mousedown", (evt) => {
      evt.preventDefault();
      this.change(view, dom, (rows, align) => {
        for (const r of rows) while (r.length <= columns) r.push("");
        align.push("");
      }, { row: 0, col: columns });
    });

    const focus = dom.pendingFocus;
    dom.pendingFocus = undefined;
    if (focus) {
      const el = this.cellEl(dom, focus.row, Math.min(focus.col, columns - 1));
      if (el) {
        el.focus();
        placeCaret(el, focus.atEnd ?? true);
      }
    }
  }

  private cellEl(dom: HTMLElement, row: number, col: number): HTMLElement | null {
    return dom.querySelector<HTMLElement>(`.table-cell-wrapper[data-row="${row}"][data-col="${col}"]`);
  }

  private showRendered(el: HTMLElement, text: string) {
    el.empty();
    el.dataset.source = text;
    renderInline(text.replace(/\\\|/g, "|"), el, this.context());
  }

  private bindCell(el: HTMLElement, ref: CellRef, view: EditorView, dom: TableDom) {
    el.addEventListener("mousedown", (evt) => {
      const link = (evt.target as HTMLElement).closest<HTMLElement>(".internal-link, .external-link");
      if (link && document.activeElement !== el && followLink(link, this.host, evt)) return;
    });
    el.addEventListener("focus", () => {
      // Beim Bearbeiten das Markdown der Zelle zeigen.
      if (el.hasClass("is-editing")) return;
      el.addClass("is-editing");
      el.setText(el.dataset.source ?? "");
    });
    el.addEventListener("blur", () => {
      // Nur echte Bearbeitungen übernehmen, nicht das Entfernen beim Neuzeichnen.
      if (!el.hasClass("is-editing")) return;
      el.removeClass("is-editing");
      if (el.isConnected) this.commitCell(view, dom, el, ref);
    });
    el.addEventListener("keydown", (evt) => this.onKey(evt, el, ref, view, dom));
    el.addEventListener("paste", (evt) => {
      // Nur Text einfügen, keine fremde Formatierung.
      evt.preventDefault();
      const text = evt.clipboardData?.getData("text/plain") ?? "";
      document.execCommand("insertText", false, text.replace(/\n/g, " "));
    });
    el.addEventListener("contextmenu", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      this.showMenu(evt, view, dom, ref);
    });
  }

  /** Geänderten Zelltext in die Quelle schreiben (nur den Bereich der Zelle). */
  private commitCell(view: EditorView, dom: TableDom, el: HTMLElement, ref: CellRef) {
    const text = escapeCell(el.innerText ?? el.textContent ?? "");
    const previous = el.dataset.source ?? "";
    if (text === previous) {
      this.showRendered(el, previous);
      return;
    }
    const from = this.tableStart(view, dom);
    if (from === null) return;
    const model = parseTable(dom.tableSource ?? this.source);
    const cell = model.rows[ref.row]?.[ref.col];
    if (!cell) {
      // Zelle fehlt in der Quelle (kurze Zeile): Tabelle neu schreiben.
      this.change(view, dom, (rows) => {
        const row = rows[ref.row];
        while (row.length <= ref.col) row.push("");
        row[ref.col] = text;
      });
      return;
    }
    const source = dom.tableSource!;
    dom.tableSource = source.slice(0, cell.from) + text + source.slice(cell.to);
    this.showRendered(el, text);
    view.dispatch({ changes: { from: from + cell.from, to: from + cell.to, insert: text }, userEvent: "input.table" });
  }

  private tableStart(view: EditorView, dom: HTMLElement): number | null {
    try {
      return view.state.doc.lineAt(view.posAtDOM(dom)).from;
    } catch {
      return null;
    }
  }

  /**
   * Strukturänderung (Zeilen, Spalten, Ausrichtung): Modell ändern und die Tabelle neu schreiben.
   * `focus` bestimmt die Zelle, die danach bearbeitet wird.
   */
  private change(view: EditorView, dom: TableDom, fn: (rows: string[][], align: TableAlign[]) => void, focus?: CellRef) {
    // Offene Bearbeitung zuerst übernehmen.
    const active = dom.querySelector<HTMLElement>(".table-cell-wrapper.is-editing");
    if (active) active.blur();
    const from = this.tableStart(view, dom);
    if (from === null) return;
    const source = dom.tableSource ?? this.source;
    const model: TableModel = parseTable(source);
    const rows = model.rows.map((r) => r.map((c) => c.text));
    const align = [...model.align];
    fn(rows, align);
    if (rows.length < 1) return;
    const text = formatTable(rows, align, model.prefix, model.trailing);
    dom.pendingFocus = focus;
    view.dispatch({ changes: { from, to: from + source.length, insert: text }, userEvent: "input.table" });
  }

  private onKey(evt: KeyboardEvent, el: HTMLElement, ref: CellRef, view: EditorView, dom: TableDom) {
    const model = parseTable(dom.tableSource ?? this.source);
    const columns = Math.max(model.align.length, ...model.rows.map((r) => r.length));
    const lastRow = model.rows.length - 1;
    const move = (row: number, col: number, atEnd = true) => {
      const target = this.cellEl(dom, row, col);
      if (!target) return;
      target.focus();
      placeCaret(target, atEnd);
    };
    if ((evt.metaKey || evt.ctrlKey) && evt.key.toLowerCase() === "a" && !evt.shiftKey && !evt.altKey) {
      // Sonst markiert der Browser den ganzen Editor, und Tippen würde ihn überschreiben.
      evt.preventDefault();
      const range = el.ownerDocument.createRange();
      range.selectNodeContents(el);
      const selection = el.ownerDocument.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    } else if (evt.key === "Tab") {
      evt.preventDefault();
      if (evt.shiftKey) {
        if (ref.col > 0) move(ref.row, ref.col - 1);
        else if (ref.row > 0) move(ref.row - 1, columns - 1);
      } else if (ref.col < columns - 1) move(ref.row, ref.col + 1);
      else if (ref.row < lastRow) move(ref.row + 1, 0);
      else this.change(view, dom, (rows) => rows.push([]), { row: ref.row + 1, col: 0 });
    } else if (evt.key === "Enter" && !evt.isComposing) {
      evt.preventDefault();
      if (ref.row < lastRow) move(ref.row + 1, ref.col);
      else this.change(view, dom, (rows) => rows.push([]), { row: ref.row + 1, col: ref.col });
    } else if (evt.key === "ArrowUp" && ref.row > 0) {
      evt.preventDefault();
      move(ref.row - 1, ref.col);
    } else if (evt.key === "ArrowDown" && ref.row < lastRow) {
      evt.preventDefault();
      move(ref.row + 1, ref.col);
    } else if (evt.key === "Escape") {
      evt.preventDefault();
      el.blur();
      // Cursor hinter die Tabelle, ohne dass sie zur Quelle aufklappt.
      const from = this.tableStart(view, dom);
      if (from !== null) {
        const end = view.state.doc.lineAt(from + (dom.tableSource ?? this.source).length);
        const after = end.number < view.state.doc.lines ? view.state.doc.line(end.number + 1).from : null;
        if (after !== null) view.dispatch({ selection: { anchor: after } });
      }
      view.focus();
    }
  }

  private showMenu(evt: MouseEvent, view: EditorView, dom: TableDom, ref: CellRef) {
    const menu = new Menu();
    const item = (title: string, icon: string, fn: (rows: string[][], align: TableAlign[]) => void, focus?: CellRef) =>
      menu.addItem((i) => i.setTitle(title).setIcon(icon).onClick(() => this.change(view, dom, fn, focus)));
    const insertColumn = (at: number) => (rows: string[][], align: TableAlign[]) => {
      for (const r of rows) {
        while (r.length < at) r.push("");
        r.splice(at, 0, "");
      }
      align.splice(at, 0, "");
    };
    if (ref.row > 0) item("Zeile darüber einfügen", "arrow-up", (rows) => rows.splice(ref.row, 0, []), ref);
    item("Zeile darunter einfügen", "arrow-down", (rows) => rows.splice(ref.row + 1, 0, []), { row: ref.row + 1, col: ref.col });
    item("Spalte links einfügen", "arrow-left", insertColumn(ref.col), ref);
    item("Spalte rechts einfügen", "arrow-right", insertColumn(ref.col + 1), { row: ref.row, col: ref.col + 1 });
    menu.addSeparator();
    for (const [title, icon, value] of [
      ["Linksbündig", "align-left", "left"],
      ["Zentriert", "align-center", "center"],
      ["Rechtsbündig", "align-right", "right"],
    ] as const) {
      item(title, icon, (_rows, align) => {
        while (align.length <= ref.col) align.push("");
        align[ref.col] = align[ref.col] === value ? "" : value;
      });
    }
    menu.addSeparator();
    if (ref.row > 0) item("Zeile löschen", "trash-2", (rows) => rows.splice(ref.row, 1));
    if (Math.max(...parseTable(dom.tableSource ?? this.source).rows.map((r) => r.length)) > 1) item("Spalte löschen", "trash-2", (rows, align) => {
      for (const r of rows) r.splice(ref.col, 1);
      align.splice(ref.col, 1);
    });
    menu.showAtMouseEvent(evt);
  }
}

/** Caret an den Anfang oder das Ende eines bearbeitbaren Elements setzen. */
function placeCaret(el: HTMLElement, atEnd: boolean) {
  const selection = el.ownerDocument.getSelection();
  if (!selection) return;
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  range.collapse(!atEnd);
  selection.removeAllRanges();
  selection.addRange(range);
}
