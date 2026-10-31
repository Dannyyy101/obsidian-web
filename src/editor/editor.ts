import { undo, redo } from "@codemirror/commands";
import { EditorSelection as CmSelection, type ChangeSpec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/** Zeile (ab 0) und Spalte, wie Obsidians `EditorPosition`. */
export interface EditorPosition {
  line: number;
  ch: number;
}

export interface EditorRange {
  from: EditorPosition;
  to: EditorPosition;
}

export interface EditorSelection {
  anchor: EditorPosition;
  head: EditorPosition;
}

export interface EditorRangeOrCaret {
  from: EditorPosition;
  to?: EditorPosition;
}

export interface EditorChange extends EditorRangeOrCaret {
  text: string;
}

export interface EditorTransaction {
  replaceSelection?: string;
  changes?: EditorChange[];
  selections?: EditorRangeOrCaret[];
  selection?: EditorRangeOrCaret;
}

export interface EditorScrollInfo {
  top: number;
  left: number;
  width: number;
  height: number;
  clientWidth: number;
  clientHeight: number;
}

/**
 * Entspricht Obsidians `Editor`: zeilen-/spaltenbasierte Fassade über die CodeMirror-Ansicht. `cm`
 * gibt Plugins wie in Obsidian Zugriff auf die `EditorView` selbst.
 */
export class Editor {
  constructor(readonly cm: EditorView) {}

  private get doc() {
    return this.cm.state.doc;
  }

  getDoc(): this {
    return this;
  }

  refresh(): void {
    this.cm.requestMeasure();
  }

  getValue(): string {
    return this.doc.toString();
  }

  setValue(content: string): void {
    this.cm.dispatch({ changes: { from: 0, to: this.doc.length, insert: content } });
  }

  getLine(line: number): string {
    return line >= 0 && line < this.doc.lines ? this.doc.line(line + 1).text : "";
  }

  setLine(n: number, text: string): void {
    const line = this.doc.line(this.clampLine(n) + 1);
    this.cm.dispatch({ changes: { from: line.from, to: line.to, insert: text } });
  }

  lineCount(): number {
    return this.doc.lines;
  }

  lastLine(): number {
    return this.doc.lines - 1;
  }

  getSelection(): string {
    const { from, to } = this.cm.state.selection.main;
    return this.cm.state.sliceDoc(from, to);
  }

  somethingSelected(): boolean {
    return this.cm.state.selection.ranges.some((r) => !r.empty);
  }

  getRange(from: EditorPosition, to: EditorPosition): string {
    const [a, b] = [this.posToOffset(from), this.posToOffset(to)].sort((x, y) => x - y);
    return this.cm.state.sliceDoc(a, b);
  }

  replaceSelection(replacement: string, origin?: string): void {
    this.cm.dispatch(this.cm.state.replaceSelection(replacement), { userEvent: origin ?? "input" });
  }

  replaceRange(replacement: string, from: EditorPosition, to?: EditorPosition, origin?: string): void {
    const a = this.posToOffset(from);
    const b = to ? this.posToOffset(to) : a;
    this.cm.dispatch({ changes: { from: Math.min(a, b), to: Math.max(a, b), insert: replacement }, userEvent: origin ?? "input" });
  }

  /** `from`/`to` = Anfang/Ende der Hauptauswahl, `head` (Standard) = Cursor, `anchor` = Auswahlanfang. */
  getCursor(string: "from" | "to" | "head" | "anchor" = "head"): EditorPosition {
    const range = this.cm.state.selection.main;
    return this.offsetToPos(range[string]);
  }

  listSelections(): EditorSelection[] {
    return this.cm.state.selection.ranges.map((r) => ({ anchor: this.offsetToPos(r.anchor), head: this.offsetToPos(r.head) }));
  }

  setCursor(pos: EditorPosition | number, ch?: number): void {
    const p = typeof pos === "number" ? { line: pos, ch: ch ?? 0 } : pos;
    this.setSelection(p);
  }

  setSelection(anchor: EditorPosition, head?: EditorPosition): void {
    this.cm.dispatch({ selection: { anchor: this.posToOffset(anchor), head: this.posToOffset(head ?? anchor) } });
  }

  setSelections(ranges: EditorSelection[], main?: number): void {
    if (!ranges.length) return;
    const cm = ranges.map((r) => CmSelection.range(this.posToOffset(r.anchor), this.posToOffset(r.head ?? r.anchor)));
    this.cm.dispatch({ selection: CmSelection.create(cm, main ?? ranges.length - 1) });
  }

  focus(): void {
    this.cm.focus();
  }

  blur(): void {
    this.cm.contentDOM.blur();
  }

  hasFocus(): boolean {
    return this.cm.hasFocus;
  }

  getScrollInfo(): EditorScrollInfo {
    const el = this.cm.scrollDOM;
    return {
      top: el.scrollTop,
      left: el.scrollLeft,
      width: el.scrollWidth,
      height: el.scrollHeight,
      clientWidth: el.clientWidth,
      clientHeight: el.clientHeight,
    };
  }

  scrollTo(x?: number | null, y?: number | null): void {
    if (x != null) this.cm.scrollDOM.scrollLeft = x;
    if (y != null) this.cm.scrollDOM.scrollTop = y;
  }

  scrollIntoView(range: EditorRange, center?: boolean): void {
    const from = this.posToOffset(range.from);
    const to = this.posToOffset(range.to);
    this.cm.dispatch({ effects: EditorView.scrollIntoView(CmSelection.range(from, to), { y: center ? "center" : "nearest" }) });
  }

  undo(): void {
    undo(this.cm);
  }

  redo(): void {
    redo(this.cm);
  }

  /** Mehrere Änderungen und eine neue Auswahl in einem Schritt (ein Undo-Schritt). */
  transaction(tx: EditorTransaction, origin?: string): void {
    const changes: ChangeSpec[] = (tx.changes ?? []).map((c) => {
      const from = this.posToOffset(c.from);
      const to = c.to ? this.posToOffset(c.to) : from;
      return { from: Math.min(from, to), to: Math.max(from, to), insert: c.text };
    });
    const state = this.cm.state;
    if (tx.replaceSelection !== undefined) {
      for (const r of state.selection.ranges) changes.push({ from: r.from, to: r.to, insert: tx.replaceSelection });
    }
    const changeSet = state.changes(changes);
    const ranges = tx.selections ?? (tx.selection ? [tx.selection] : null);
    // Neue Auswahl bezieht sich wie in Obsidian auf das Dokument nach den Änderungen.
    const newDoc = changeSet.apply(state.doc);
    const toOffset = (p: EditorPosition) => {
      const line = newDoc.line(Math.min(Math.max(p.line, 0), newDoc.lines - 1) + 1);
      return line.from + Math.min(Math.max(p.ch, 0), line.length);
    };
    this.cm.dispatch({
      changes: changeSet,
      selection: ranges?.length
        ? CmSelection.create(ranges.map((r) => CmSelection.range(toOffset(r.from), toOffset(r.to ?? r.from))))
        : undefined,
      userEvent: origin ?? "input",
    });
  }

  wordAt(pos: EditorPosition): EditorRange | null {
    const range = this.cm.state.wordAt(this.posToOffset(pos));
    return range ? { from: this.offsetToPos(range.from), to: this.offsetToPos(range.to) } : null;
  }

  posToOffset(pos: EditorPosition): number {
    const line = this.doc.line(this.clampLine(pos.line) + 1);
    return line.from + Math.min(Math.max(pos.ch, 0), line.length);
  }

  offsetToPos(offset: number): EditorPosition {
    const clamped = Math.min(Math.max(offset, 0), this.doc.length);
    const line = this.doc.lineAt(clamped);
    return { line: line.number - 1, ch: clamped - line.from };
  }

  private clampLine(line: number): number {
    return Math.min(Math.max(line, 0), this.doc.lines - 1);
  }
}
