import type { SyntaxNode } from "@lezer/common";
import { obsidianMarkdownParser } from "../../markdown/syntax";
import { isExternalUrl, splitWikilink, wikilinkDisplay } from "../live-preview/host";
import type { RenderContext } from "./context";
import { renderEmbed } from "./embed";
import { renderFootnoteRef } from "./footnotes";
import { mathSource, renderMath } from "./math";

const TAGS: Record<string, keyof HTMLElementTagNameMap> = {
  Emphasis: "em",
  StrongEmphasis: "strong",
  Strikethrough: "del",
  Highlight: "mark",
};
/** Syntaxzeichen, die im gerenderten Text nicht erscheinen. */
const HIDDEN = new Set([
  "EmphasisMark", "StrikethroughMark", "HighlightMark", "CodeMark", "LinkMark", "URL", "LinkTitle",
  "QuoteMark", "HeaderMark", "TaskMarker", "ListMark", "ObsidianComment", "LinkLabel",
]);

/** Rendert eine Zeile Inline-Markdown (z. B. eine Tabellenzelle) mit Obsidians Klassennamen. */
export function renderInline(text: string, parent: HTMLElement, ctx?: RenderContext): void {
  const paragraph = obsidianMarkdownParser.parse(text).topNode.firstChild;
  if (!paragraph) return parent.appendText(text);
  renderInlineChildren(text, paragraph, parent, ctx);
}

/** Inline-Inhalt eines Knotens (Absatz, Überschrift, Zelle …) aus dem Gesamttext `text`. */
export function renderInlineChildren(
  text: string,
  node: SyntaxNode,
  parent: HTMLElement,
  ctx?: RenderContext,
  from = node.from,
  to = node.to,
): void {
  let pos = from;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.to <= from || child.from >= to) continue;
    if (child.from > pos) appendText(parent, text.slice(pos, child.from));
    renderNode(text, child, parent, ctx);
    pos = child.to;
  }
  if (pos < to) appendText(parent, text.slice(pos, to));
}

/**
 * Text mit Zeilenumbrüchen: wie in Obsidian (ohne „Strikte Zeilenumbrüche“) wird jeder Umbruch
 * zu <br>. Einrückung und Zitatzeichen am Zeilenanfang entfallen.
 */
function appendText(parent: HTMLElement, text: string) {
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (i > 0) parent.createEl("br");
    const clean = i > 0 ? line.replace(/^[ \t]*(>[ \t]?)*[ \t]*/, "") : line;
    if (clean) parent.appendText(clean);
  });
}

function renderNode(text: string, node: SyntaxNode, parent: HTMLElement, ctx?: RenderContext) {
  const source = text.slice(node.from, node.to);
  if (HIDDEN.has(node.name)) return;
  if (node.name in TAGS) {
    renderInlineChildren(text, node, parent.createEl(TAGS[node.name]), ctx);
    return;
  }
  switch (node.name) {
    case "InlineCode":
      // CommonMark: gleich lange Backtick-Folgen; je ein Leerzeichen innen wird entfernt.
      parent.createEl("code", { text: (/^(`+)([\s\S]*?)\1$/.exec(source)?.[2] ?? source).replace(/^ (.+) $/, "$1") });
      return;
    case "Escape":
      parent.appendText(source.slice(1));
      return;
    case "HardBreak":
      parent.createEl("br");
      return;
    case "Wikilink": {
      const inner = source.slice(2, -2);
      const { target } = splitWikilink(inner);
      const resolved = ctx ? ctx.host.isResolved(target, ctx.sourcePath) : true;
      parent.createEl("a", {
        cls: ["internal-link", ...(resolved ? [] : ["is-unresolved"])],
        text: wikilinkDisplay(inner),
        attr: { "data-href": target, href: target, "data-source-path": ctx?.sourcePath ?? null },
      });
      return;
    }
    case "Embed":
      if (ctx) renderEmbed(source.slice(3, -2), parent, ctx);
      else parent.appendText(source);
      return;
    case "Link": {
      const url = node.getChild("URL");
      const href = url ? text.slice(url.from, url.to) : "";
      const external = isExternalUrl(href);
      const a = parent.createEl("a", {
        cls: external ? "external-link" : "internal-link",
        attr: { "data-href": href, href, "data-source-path": ctx?.sourcePath ?? null },
      });
      if (external) a.setAttrs({ target: "_blank", rel: "noopener" });
      renderInlineChildren(text, node, a, ctx);
      return;
    }
    case "Image": {
      const url = node.getChild("URL");
      const marks = node.getChildren("LinkMark");
      if (!url || marks.length < 2) return parent.appendText(source);
      const alt = text.slice(marks[0].to, marks[1].from);
      const href = decodeURI(text.slice(url.from, url.to));
      if (isExternalUrl(href)) {
        const img = parent.createEl("img", { attr: { src: href, alt } });
        const width = /\|(\d+)$/.exec(alt)?.[1];
        if (width) img.width = Number(width);
      } else if (ctx) {
        renderEmbed(`${href}|${alt.split("|").pop() ?? ""}`, parent, ctx);
      }
      return;
    }
    case "Autolink":
    case "URL": {
      const href = source.replace(/^<|>$/g, "");
      parent.createEl("a", { cls: "external-link", text: href, attr: { href, "data-href": href, target: "_blank", rel: "noopener" } });
      return;
    }
    case "Tag":
      parent.createEl("a", { cls: "tag", text: source, attr: { href: source } });
      return;
    case "FootnoteReference": {
      const footnotes = ctx?.footnotes;
      const n = footnotes?.reference(source.slice(2, -1)) ?? null;
      // Ohne Definition bleibt der Verweis Text, wie in Obsidian.
      if (!footnotes || n === null) parent.appendText(source);
      else renderFootnoteRef(parent, n, footnotes);
      return;
    }
    case "InlineFootnote": {
      const footnotes = ctx?.footnotes;
      if (footnotes) renderFootnoteRef(parent, footnotes.inline(source.slice(2, -1)), footnotes);
      else parent.createEl("sup", { cls: "footnote-ref", text: "*", attr: { "aria-label": source.slice(2, -1) } });
      return;
    }
    case "InlineMath": {
      const { tex, display } = mathSource(source);
      parent.appendChild(renderMath(tex, display));
      return;
    }
    case "HTMLTag":
    case "Comment":
      // Kein HTML-Rendering ohne Sanitizer; Obsidian bereinigt HTML, wir zeigen es als Text.
      if (node.name === "HTMLTag") parent.appendText(source);
      return;
    default:
      if (node.firstChild) renderInlineChildren(text, node, parent, ctx);
      else appendText(parent, source);
  }
}
