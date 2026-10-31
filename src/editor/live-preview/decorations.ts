import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";
import { type EditorSelection, type EditorState, type Extension, type Range, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  type WidgetType,
} from "@codemirror/view";
import { extensionOf, IMAGE_EXTENSIONS, type LivePreviewHost, splitWikilink, wikilinkDisplay } from "./host";
import {
  BulletWidget,
  CheckboxWidget,
  CalloutWidget,
  EmbedWidget,
  FootnoteRefWidget,
  followLink,
  HrWidget,
  ImageWidget,
  LinkWidget,
  MathWidget,
  MermaidWidget,
  TableWidget,
} from "./widgets";
import { mathSource } from "../render/math";

const hidden = Decoration.replace({});
const lineClass = (cls: string) => Decoration.line({ class: cls });
const markClass = (cls: string, attributes?: Record<string, string>) => Decoration.mark({ class: cls, attributes });

const INLINE_MARKS: Record<string, string> = {
  Emphasis: "EmphasisMark",
  StrongEmphasis: "EmphasisMark",
  Strikethrough: "StrikethroughMark",
  Highlight: "HighlightMark",
  InlineCode: "CodeMark",
};

/** Berührt die Auswahl den Bereich (inkl. Rändern)? Dann wird dort die Syntax gezeigt. */
function touches(selection: EditorSelection, from: number, to: number): boolean {
  return selection.ranges.some((r) => r.from <= to && r.to >= from);
}

class Builder {
  ranges: Range<Decoration>[] = [];
  private activeLines: Set<number>;
  /** Blöcke, deren Quelle vollständig sichtbar bleibt (aufgedeckte Callouts). */
  private rawBlocks: [number, number][] = [];

  constructor(
    private state: EditorState,
    private host: LivePreviewHost,
    private live: boolean,
  ) {
    this.activeLines = new Set();
    for (const r of state.selection.ranges) {
      const first = state.doc.lineAt(r.from).number;
      const last = state.doc.lineAt(r.to).number;
      for (let n = first; n <= last; n++) this.activeLines.add(n);
    }
  }

  private footnotes: Map<string, string> | null = null;

  /** Text der Definition `[^label]: …` für den Tooltip, einmal pro Durchlauf gesucht. */
  private footnoteDefinition(label: string): string {
    if (!this.footnotes) {
      this.footnotes = new Map();
      for (const m of this.state.doc.toString().matchAll(/^[ \t>]*\[\^([^\]\s]+)\]:[ \t]?(.*)$/gm)) {
        if (!this.footnotes.has(m[1])) this.footnotes.set(m[1], m[2]);
      }
    }
    return this.footnotes.get(label) ?? "";
  }

  private add(from: number, to: number, deco: Decoration) {
    if (from <= to) this.ranges.push(deco.range(from, to));
  }

  private hide(from: number, to: number) {
    if (from < to) this.add(from, to, hidden);
  }

  private lineActive(pos: number) {
    return this.activeLines.has(this.state.doc.lineAt(pos).number);
  }

  private revealed(from: number, to: number) {
    return !this.live || touches(this.state.selection, from, to);
  }

  /** Wie `revealed`, aber über ganze Zeilen – so entscheidet auch das blockWidgetField. */
  private revealedLines(from: number, to: number) {
    return touches(this.state.selection, this.state.doc.lineAt(from).from, this.state.doc.lineAt(to).to);
  }

  /** Markierung samt folgendem Leerzeichen ausblenden (`# `, `> `, `- `). */
  private hideWithSpace(from: number, to: number) {
    this.hide(from, this.state.sliceDoc(to, to + 1) === " " ? to + 1 : to);
  }

  private eachLine(from: number, to: number, fn: (lineFrom: number, lineTo: number, n: number) => void) {
    for (let pos = from; pos <= to; ) {
      const line = this.state.doc.lineAt(pos);
      fn(line.from, line.to, line.number);
      pos = line.to + 1;
    }
  }

  /** Behandelt einen Knoten; `false` = Kinder überspringen. */
  node(n: SyntaxNodeRef): boolean | void {
    const { state } = this;
    const heading = /^ATXHeading(\d)$/.exec(n.name);
    if (heading) {
      this.add(n.from, n.from, lineClass(`HyperMD-header HyperMD-header-${heading[1]}`));
      const mark = n.node.getChild("HeaderMark");
      if (mark && mark.from === n.from && this.live && !this.lineActive(n.from)) this.hideWithSpace(mark.from, mark.to);
      return;
    }
    const setext = /^SetextHeading(\d)$/.exec(n.name);
    if (setext) {
      this.add(n.from, n.from, lineClass(`HyperMD-header HyperMD-header-${setext[1]}`));
      return;
    }

    if (n.name in INLINE_MARKS) {
      if (n.name === "Highlight") this.add(n.from, n.to, markClass("cm-highlight"));
      if (!this.revealed(n.from, n.to)) {
        const markName = INLINE_MARKS[n.name];
        for (let c = n.node.firstChild; c; c = c.nextSibling) if (c.name === markName) this.hide(c.from, c.to);
      }
      return;
    }

    switch (n.name) {
      case "Frontmatter":
        this.eachLine(n.from, n.to, (from) => this.add(from, from, lineClass("cm-frontmatter")));
        return false;

      case "FencedCode": {
        if (this.live && blockWidgetFor(state, n.node, this.host) && !this.revealedLines(n.from, n.to)) return false;
        const first = state.doc.lineAt(n.from);
        const last = state.doc.lineAt(n.to);
        this.eachLine(n.from, n.to, (from, _to, num) => {
          const edge = num === first.number ? " HyperMD-codeblock-begin" : num === last.number ? " HyperMD-codeblock-end" : "";
          this.add(from, from, lineClass(`HyperMD-codeblock${edge}`));
        });
        if (!this.revealed(n.from, n.to)) {
          this.hide(first.from, first.to);
          if (last.number !== first.number && /^\s*(```|~~~)/.test(last.text)) this.hide(last.from, last.to);
        }
        return false;
      }

      case "Blockquote":
        if (this.live && blockWidgetFor(state, n.node, this.host)) {
          if (!this.revealedLines(n.from, n.to)) return false;
          // Aufgedeckter Callout: komplette Quelle zeigen, auch die `>` der anderen Zeilen.
          this.rawBlocks.push([n.from, n.to]);
        }
        this.eachLine(n.from, n.to, (from) => this.add(from, from, lineClass("HyperMD-quote")));
        return;

      case "QuoteMark":
        if (this.rawBlocks.some(([from, to]) => n.from >= from && n.to <= to)) return;
        if (this.live && !this.lineActive(n.from)) this.hideWithSpace(n.from, n.to);
        return;

      case "HorizontalRule":
        if (!this.live || this.lineActive(n.from)) return;
        this.add(n.from, n.to, Decoration.replace({ widget: new HrWidget() }));
        return;

      case "ListMark": {
        const item = n.node.parent;
        const list = item?.parent;
        if (!item || !list) return;
        const bullet = list.name === "BulletList";
        const line = state.doc.lineAt(n.from);
        const markerEnd = state.sliceDoc(n.to, n.to + 1) === " " ? n.to + 1 : n.to;
        const task = item.getChild("Task")?.getChild("TaskMarker");

        if (this.live) {
          // Hängender Einzug wie in Obsidian: umbrochene Zeilen beginnen unter dem Text, nicht
          // unter dem Aufzählungszeichen. Die Tiefe zählt die umgebenden Listen.
          let level = 0;
          for (let p = list.parent; p; p = p.parent) if (p.name === "BulletList" || p.name === "OrderedList") level++;
          const width = bullet ? "var(--list-bullet-width)" : `${((n.to - n.from) * 0.6 + 0.5).toFixed(2)}em`;
          this.add(
            line.from,
            line.from,
            Decoration.line({
              class: "HyperMD-list-line",
              attributes: { style: `--list-level: ${level}; --list-marker-width: ${width}` },
            }),
          );
          if (n.from > line.from) this.add(line.from, n.from, markClass("cm-list-indent"));
        }

        if (task) {
          if (!this.revealed(n.from, task.to)) this.hide(n.from, markerEnd);
        } else if (bullet && !this.revealed(n.from, markerEnd)) {
          this.add(n.from, markerEnd, Decoration.replace({ widget: new BulletWidget() }));
        } else if (this.live) {
          this.add(n.from, markerEnd, markClass("cm-list-marker"));
        }
        return;
      }

      case "TaskMarker": {
        const checked = /\[[^ ]\]/.test(state.sliceDoc(n.from, n.to));
        const line = state.doc.lineAt(n.from);
        this.add(line.from, line.from, lineClass(`task-list-item${checked ? " is-checked" : ""}`));
        const listMark = n.node.parent?.parent?.getChild("ListMark");
        if (!this.revealed(listMark?.from ?? n.from, n.to)) {
          const to = state.sliceDoc(n.to, n.to + 1) === " " ? n.to + 1 : n.to;
          this.add(n.from, to, Decoration.replace({ widget: new CheckboxWidget(checked) }));
        }
        return;
      }

      case "Link": {
        const url = n.node.getChild("URL");
        const marks = n.node.getChildren("LinkMark");
        if (!url || marks.length < 2) return;
        const href = state.sliceDoc(url.from, url.to);
        const textFrom = marks[0].to;
        const textTo = marks[1].from;
        const external = /^[a-z][a-z0-9+.-]*:/i.test(href);
        this.add(textFrom, textTo, markClass(external ? "cm-link external-link" : "cm-link internal-link", { "data-href": href }));
        if (!this.revealed(n.from, n.to)) {
          this.hide(n.from, textFrom);
          this.hide(textTo, n.to);
        }
        return false;
      }

      case "Image": {
        if (!this.revealed(n.from, n.to)) {
          const url = n.node.getChild("URL");
          const marks = n.node.getChildren("LinkMark");
          if (!url || marks.length < 2) return false;
          const alt = state.sliceDoc(marks[0].to, marks[1].from);
          const width = /^\d+$/.test(alt.split("|").pop() ?? "") ? Number(alt.split("|").pop()) : null;
          const widget = new ImageWidget(decodeURI(state.sliceDoc(url.from, url.to)), alt, width, this.host);
          this.add(n.from, n.to, Decoration.replace({ widget }));
        }
        return false;
      }

      case "Wikilink":
      case "Embed": {
        const target = n.node.getChild("WikilinkTarget");
        if (!target) return false;
        const inner = state.sliceDoc(target.from, target.to);
        const { target: linkpath, alias } = splitWikilink(inner);
        if (this.revealed(n.from, n.to)) {
          this.add(target.from, target.to, markClass("cm-hmd-internal-link"));
          return false;
        }
        let widget;
        if (n.name === "Embed" && IMAGE_EXTENSIONS.has(extensionOf(linkpath))) {
          const width = alias && /^\d+(x\d+)?$/.test(alias) ? Number(alias.split("x")[0]) : null;
          widget = new ImageWidget(linkpath, linkpath, width, this.host);
        } else {
          widget =
            n.name === "Embed"
              ? new EmbedWidget(inner, this.host)
              : new LinkWidget(wikilinkDisplay(inner), linkpath, this.host.isResolved(linkpath), this.host);
        }
        this.add(n.from, n.to, Decoration.replace({ widget }));
        return false;
      }

      case "Tag":
        this.add(n.from, n.to, markClass("cm-hashtag", { "data-tag": state.sliceDoc(n.from + 1, n.to) }));
        return false;

      case "ObsidianComment":
        this.add(n.from, n.to, markClass("cm-comment"));
        return false;

      case "FootnoteReference": {
        const label = state.sliceDoc(n.from + 2, n.to - 1);
        if (this.revealed(n.from, n.to)) this.add(n.from, n.to, markClass("cm-footref"));
        else this.add(n.from, n.to, Decoration.replace({ widget: new FootnoteRefWidget(label, this.footnoteDefinition(label)) }));
        return false;
      }

      case "InlineFootnote":
        // Inhalt bleibt sichtbar (klein, hochgestellt), nur `^[` und `]` verschwinden.
        this.add(n.from, n.to, markClass("cm-inline-footnote"));
        if (!this.revealed(n.from, n.to)) {
          this.hide(n.from, n.from + 2);
          this.hide(n.to - 1, n.to);
        }
        return;

      case "FootnoteDefinition": {
        this.eachLine(n.from, n.to, (from) => this.add(from, from, lineClass("HyperMD-footnote")));
        const marks = n.node.getChildren("FootnoteMark");
        if (marks.length >= 2) this.add(n.from, marks[1].to, markClass("cm-footref"));
        return;
      }

      case "Table":
        // Gerendert vom blockWidgetField; hier nur die Quelle als Tabelle kennzeichnen.
        this.eachLine(n.from, n.to, (from) => this.add(from, from, lineClass("HyperMD-table-row")));
        return false;

      case "BlockMath":
        // Gerendert vom blockWidgetField; sichtbar ist hier nur die Quelle (Cursor im Block).
        this.eachLine(n.from, n.to, (from) => this.add(from, from, lineClass("HyperMD-math")));
        return false;

      case "InlineMath":
        if (this.revealed(n.from, n.to)) {
          this.add(n.from, n.to, markClass("cm-math"));
        } else {
          const { tex, display } = mathSource(state.sliceDoc(n.from, n.to));
          this.add(n.from, n.to, Decoration.replace({ widget: new MathWidget(tex, display) }));
        }
        return false;
    }
  }
}

function buildInline(view: EditorView, host: LivePreviewHost, live: boolean): DecorationSet {
  const builder = new Builder(view.state, host, live);
  const tree = syntaxTree(view.state);
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({ from, to, enter: (n) => builder.node(n) });
  }
  return Decoration.set(builder.ranges, true);
}

function inlinePlugin(host: LivePreviewHost, live: boolean) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildInline(view, host, live);
      }

      update(u: ViewUpdate) {
        if (u.docChanged || u.selectionSet || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
          this.decorations = buildInline(u.view, host, live);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        mousedown(evt) {
          if (!live || evt.button !== 0 || evt.shiftKey || evt.altKey) return false;
          const link = (evt.target as HTMLElement).closest<HTMLElement>(".cm-link[data-href]");
          return link ? followLink(link, host, evt) : false;
        },
      },
    },
  );
}

/**
 * Block-Widget für einen Knoten, falls er in der Live Preview als Ganzes gerendert wird: Tabellen,
 * `$$`-Formeln, Callouts und Mermaid-Diagramme.
 */
function blockWidgetFor(state: EditorState, node: SyntaxNode, host: LivePreviewHost): WidgetType | null {
  const source = () => state.sliceDoc(state.doc.lineAt(node.from).from, state.doc.lineAt(node.to).to);
  switch (node.name) {
    case "Table":
      return new TableWidget(source(), host);
    case "BlockMath":
      return new MathWidget(mathSource(state.sliceDoc(node.from, node.to)).tex, true);
    case "Blockquote": {
      if (!/^\s*>\s*\[![^\]\s]+\]/.test(state.doc.lineAt(node.from).text)) return null;
      return new CalloutWidget(source(), host);
    }
    case "FencedCode": {
      const info = node.getChild("CodeInfo");
      if (!info || state.sliceDoc(info.from, info.to).trim().toLowerCase() !== "mermaid") return null;
      const code = node.getChildren("CodeText").map((c) => state.sliceDoc(c.from, c.to)).join("");
      return new MermaidWidget(code, host);
    }
    default:
      return null;
  }
}

/**
 * Mehrzeilige Elemente als Block-Widgets. Blockdecorations, die Zeilenumbrüche ersetzen, müssen
 * aus einem StateField kommen.
 */
function blockWidgetField(host: LivePreviewHost) {
  const build = (state: EditorState): DecorationSet => {
    const ranges: Range<Decoration>[] = [];
    syntaxTree(state).iterate({
      enter: (n) => {
        if (n.name === "Paragraph" || n.name === "Frontmatter") return false;
        const widget = blockWidgetFor(state, n.node, host);
        if (!widget) return n.name === "FencedCode" ? false : undefined;
        const from = state.doc.lineAt(n.from).from;
        const to = state.doc.lineAt(n.to).to;
        if (!touches(state.selection, from, to)) {
          ranges.push(Decoration.replace({ widget, block: true }).range(from, to));
        }
        return false;
      },
    });
    return Decoration.set(ranges, true);
  };

  return StateField.define<DecorationSet>({
    create: build,
    update(deco, tr) {
      if (tr.docChanged || tr.selection || syntaxTree(tr.startState) !== syntaxTree(tr.state)) return build(tr.state);
      return deco;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}

/** Quellmodus: nur Zeilenklassen und Hervorhebungen, nichts wird ausgeblendet. */
export function sourceModeDecorations(host: LivePreviewHost): Extension {
  return inlinePlugin(host, false);
}

/** Live Preview: rendert alles außer dem Element bzw. der Zeile unter dem Cursor. */
export function livePreview(host: LivePreviewHost): Extension {
  return [inlinePlugin(host, true), blockWidgetField(host), EditorView.editorAttributes.of({ class: "is-live-preview" })];
}
