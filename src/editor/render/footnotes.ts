import type { Tree } from "@lezer/common";
import type { RenderContext } from "./context";

interface Footnote {
  /** Label bei `[^label]`, null bei Inline-Fußnoten. */
  label: string | null;
  content: string;
}

/** Fußnoten eines gerenderten Dokuments: Definitionen und Nummern in Reihenfolge der Verweise. */
export class FootnoteState {
  /** Eindeutiger Teil der IDs, damit mehrere Ansichten sich nicht in die Quere kommen. */
  readonly id = Math.random().toString(36).slice(2, 8);
  readonly notes: Footnote[] = [];
  private definitions = new Map<string, string>();
  private numbers = new Map<string, number>();
  /** Nummern, deren erster Verweis schon gerendert ist (nur er bekommt die ID für den Rücksprung). */
  private rendered = new Set<number>();

  constructor(source: string, tree: Tree) {
    tree.iterate({
      enter: (n) => {
        if (n.name !== "FootnoteDefinition") return;
        const label = n.node.getChild("FootnoteLabel");
        const marks = n.node.getChildren("FootnoteMark");
        if (!label || marks.length < 2) return false;
        const key = source.slice(label.from, label.to);
        // Folgezeilen: Einrückung und Zitatzeichen entfernen.
        const content = source.slice(marks[1].to, n.to).trim().replace(/\n[ \t]*(?:>[ \t]?)*[ \t]*/g, "\n");
        if (!this.definitions.has(key)) this.definitions.set(key, content);
        return false;
      },
    });
  }

  /** Nummer für `[^label]` (vergibt beim ersten Verweis die nächste), oder null ohne Definition. */
  reference(label: string): number | null {
    const known = this.numbers.get(label);
    if (known) return known;
    const content = this.definitions.get(label);
    if (content === undefined) return null;
    this.notes.push({ label, content });
    this.numbers.set(label, this.notes.length);
    return this.notes.length;
  }

  /** Inline-Fußnote `^[…]`: bekommt immer eine eigene Nummer. */
  inline(content: string): number {
    this.notes.push({ label: null, content });
    return this.notes.length;
  }

  /** true beim ersten Verweis auf `n`. */
  claimRef(n: number): boolean {
    if (this.rendered.has(n)) return false;
    this.rendered.add(n);
    return true;
  }

  refId(n: number): string {
    return `fnref-${n}-${this.id}`;
  }

  noteId(n: number): string {
    return `fn-${n}-${this.id}`;
  }
}

/** Hochgestellter Verweis wie in Obsidian (`sup.footnote-ref > a.footnote-link`). */
export function renderFootnoteRef(parent: HTMLElement, n: number, state: FootnoteState): void {
  const sup = parent.createEl("sup", { cls: "footnote-ref", attr: { "data-footnote-id": state.refId(n) } });
  if (state.claimRef(n)) sup.id = state.refId(n);
  sup.createEl("a", { cls: "footnote-link", text: String(n), attr: { href: `#${state.noteId(n)}` } });
}

/**
 * Fußnotenliste am Ende des Dokuments. `renderContent` rendert den Text einer Fußnote; Verweise
 * darin können weitere Nummern vergeben, die Liste wächst dann mit.
 */
export function renderFootnoteSection(
  el: HTMLElement,
  state: FootnoteState,
  ctx: RenderContext,
  renderContent: (text: string, parent: HTMLElement, ctx: RenderContext) => void,
): void {
  if (!state.notes.length) return;
  const section = el.createEl("section", { cls: "footnotes" });
  section.createEl("hr", { cls: "footnotes-sep" });
  const list = section.createEl("ol", { cls: "footnotes-list" });
  for (let i = 0; i < state.notes.length; i++) {
    const n = i + 1;
    const li = list.createEl("li", { cls: "footnote-item", attr: { id: state.noteId(n), "data-footnote-id": state.noteId(n) } });
    const p = li.createEl("p");
    renderContent(state.notes[i].content, p, ctx);
    p.appendText(" ");
    p.createEl("a", { cls: "footnote-backref footnote-link", text: "↩︎", attr: { href: `#${state.refId(n)}` } });
  }
}

/** Klick auf einen Fußnotenlink scrollt innerhalb der Ansicht, statt die URL zu ändern. */
export function followFootnoteLink(link: HTMLElement, root: HTMLElement, evt: MouseEvent): void {
  evt.preventDefault();
  const id = link.getAttribute("href")?.slice(1);
  if (!id) return;
  const target = root.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
  target?.scrollIntoView({ block: "center" });
}
