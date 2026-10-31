import { codeFolding, foldEffect, foldedRanges, syntaxTree, unfoldEffect } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { type EditorState, type Extension, Facet, type Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import { setIcon } from "../ui/icons";

/** Obsidians Einstellungen `foldHeading` und `foldIndent` aus `app.json`. */
export interface FoldConfig {
  foldHeading: boolean;
  foldIndent: boolean;
}

const foldConfig = Facet.define<FoldConfig, FoldConfig>({
  combine: (values) => values[0] ?? { foldHeading: true, foldIndent: true },
});

const headingLevel = (node: SyntaxNode) => Number(/^(?:ATX|Setext)Heading(\d)$/.exec(node.name)?.[1] ?? 0);

/**
 * Einklappbarer Bereich, der in der Zeile ab `lineFrom` beginnt: eine Überschrift bis vor die
 * nächste gleich hohe oder höhere, ein Listenpunkt samt Unterpunkten. Sonst null.
 */
export function foldRangeAt(state: EditorState, lineFrom: number): { from: number; to: number } | null {
  const { foldHeading, foldIndent } = state.facet(foldConfig);
  const line = state.doc.lineAt(lineFrom);
  const tree = syntaxTree(state);
  if (foldHeading) {
    for (let node: SyntaxNode | null = tree.resolveInner(line.from, 1); node; node = node.parent) {
      const level = headingLevel(node);
      if (!level || node.from < line.from) continue;
      let last: SyntaxNode = node;
      for (let next = last.nextSibling; next && !(headingLevel(next) && headingLevel(next) <= level); next = next.nextSibling) last = next;
      return last.to > line.to ? { from: line.to, to: last.to } : null;
    }
  }
  if (foldIndent) {
    const start = line.from + (/^\s*/.exec(line.text)?.[0].length ?? 0);
    for (let node: SyntaxNode | null = tree.resolveInner(start, 1); node; node = node.parent) {
      if (node.name !== "ListItem") continue;
      if (state.doc.lineAt(node.from).number !== line.number) break;
      return node.to > line.to ? { from: line.to, to: node.to } : null;
    }
  }
  return null;
}

function foldedAt(state: EditorState, from: number, to: number): boolean {
  let found = false;
  foldedRanges(state).between(from, to, (a) => {
    if (a === to) found = true;
  });
  return found;
}

/** Klappt den Bereich der Zeile ein bzw. aus. */
export function toggleFoldAt(view: EditorView, lineFrom: number): boolean {
  const range = foldRangeAt(view.state, lineFrom);
  if (!range) return false;
  const line = view.state.doc.lineAt(lineFrom);
  const effect = foldedAt(view.state, line.from, line.to) ? unfoldEffect : foldEffect;
  view.dispatch({ effects: effect.of(range) });
  return true;
}

/** `editor:toggle-fold`: Bereich der Cursorzeile oder des nächsten umschließenden Abschnitts. */
export function toggleFold(view: EditorView): boolean {
  const { state } = view;
  for (let n = state.doc.lineAt(state.selection.main.head).number; n >= 1; n--) {
    const line = state.doc.line(n);
    const range = foldRangeAt(state, line.from);
    if (range && range.to >= state.selection.main.head) return toggleFoldAt(view, line.from);
  }
  return false;
}

/** `editor:fold-all`: alle Überschriften und Listen einklappen. */
export function foldAll(view: EditorView): void {
  const effects = [];
  const { doc } = view.state;
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const range = foldRangeAt(view.state, line.from);
    if (range && !foldedAt(view.state, line.from, line.to)) effects.push(foldEffect.of(range));
  }
  if (effects.length) view.dispatch({ effects });
}

/** `editor:unfold-all`. */
export function unfoldAll(view: EditorView): void {
  const effects: ReturnType<typeof unfoldEffect.of>[] = [];
  foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => void effects.push(unfoldEffect.of({ from, to })));
  if (effects.length) view.dispatch({ effects });
}

/** Zeilennummern (ab 1), deren Bereich eingeklappt ist – zum Merken pro Datei. */
export function foldedLines(state: EditorState): number[] {
  const lines: number[] = [];
  foldedRanges(state).between(0, state.doc.length, (from) => void lines.push(state.doc.lineAt(from).number));
  return lines.sort((a, b) => a - b);
}

/** Gemerkte Einklappungen wiederherstellen (Bereiche werden neu berechnet). */
export function restoreFolds(view: EditorView, lines: number[]): void {
  const { doc } = view.state;
  const effects = lines
    .filter((n) => n >= 1 && n <= doc.lines)
    .map((n) => foldRangeAt(view.state, doc.line(n).from))
    .filter((r) => r !== null)
    .map((r) => foldEffect.of(r));
  if (effects.length) view.dispatch({ effects });
}

/** Pfeil links neben einklappbaren Zeilen, wie Obsidians `.cm-fold-indicator`. */
class FoldIndicator extends WidgetType {
  constructor(private folded: boolean) {
    super();
  }

  eq(other: FoldIndicator) {
    return other.folded === this.folded;
  }

  toDOM(view: EditorView) {
    const el = createDiv({ cls: ["cm-fold-indicator", ...(this.folded ? ["is-collapsed"] : [])] });
    const icon = el.createDiv("collapse-indicator collapse-icon");
    setIcon(icon, "chevron-down");
    el.addEventListener("mousedown", (evt) => {
      evt.preventDefault();
      toggleFoldAt(view, view.state.doc.lineAt(view.posAtDOM(el)).from);
    });
    return el;
  }

  ignoreEvent() {
    return true;
  }
}

function buildIndicators(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const { state } = view;
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = state.doc.lineAt(pos);
      if (foldRangeAt(state, line.from)) {
        const folded = foldedAt(state, line.from, line.to);
        ranges.push(Decoration.widget({ widget: new FoldIndicator(folded), side: -1 }).range(line.from));
        if (folded) ranges.push(Decoration.line({ class: "is-folded" }).range(line.from));
      }
      pos = line.to + 1;
    }
  }
  return Decoration.set(ranges, true);
}

const indicators = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildIndicators(view);
    }

    update(u: ViewUpdate) {
      const foldsChanged = u.transactions.some((tr) => tr.effects.some((e) => e.is(foldEffect) || e.is(unfoldEffect)));
      if (u.docChanged || u.viewportChanged || foldsChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        this.decorations = buildIndicators(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/**
 * Überschriften und Listen einklappen. `onChange` meldet die eingeklappten Zeilen, damit der
 * Editor sie pro Datei merken kann.
 */
export function folding(config: FoldConfig, onChange?: (lines: number[]) => void): Extension {
  return [
    foldConfig.of(config),
    codeFolding({
      placeholderDOM: (_view, onclick) => {
        const el = createSpan({ cls: "cm-foldPlaceholder", text: "…", attr: { "aria-label": "Ausklappen" } });
        el.addEventListener("click", onclick);
        return el;
      },
    }),
    indicators,
    EditorView.updateListener.of((u) => {
      if (onChange && u.transactions.some((tr) => tr.effects.some((e) => e.is(foldEffect) || e.is(unfoldEffect)))) {
        onChange(foldedLines(u.state));
      }
    }),
  ];
}
