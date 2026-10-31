import type { SyntaxNode } from "@lezer/common";
import { obsidianMarkdownParser } from "../../markdown/syntax";
import { followLink } from "../live-preview/widgets";
import { parseCallout, renderCalloutShell } from "./callout";
import type { RenderContext } from "./context";
import { copyCode, highlightCodeElement } from "./code";
import { renderInline, renderInlineChildren } from "./inline";
import { mathSource, renderMath } from "./math";
import { renderMermaid } from "./mermaid";
import { renderTable } from "./table";

/**
 * Rendert Markdown (CommonMark + GFM + Obsidian) mit demselben Parser wie der Editor – Lesemodus,
 * Embeds und Callouts können so nie anders interpretieren als die Live Preview.
 * DOM-Struktur und Klassennamen folgen Obsidian (`.markdown-rendered`), damit Themes greifen.
 */
export function renderMarkdown(source: string, el: HTMLElement, ctx: RenderContext): void {
  const tree = obsidianMarkdownParser.parse(source);
  renderBlocks(source, tree.topNode, el, ctx);
  if (ctx.depth === 0) attachLinkHandler(el, ctx);
}

function attachLinkHandler(el: HTMLElement, ctx: RenderContext) {
  el.addEventListener("click", (evt) => {
    const link = (evt.target as HTMLElement).closest<HTMLElement>("a.internal-link, a.external-link");
    if (link && el.contains(link) && evt.button === 0) followLink(link, ctx.host, evt);
  });
}

function renderBlocks(text: string, node: SyntaxNode, el: HTMLElement, ctx: RenderContext) {
  for (let child = node.firstChild; child; child = child.nextSibling) renderBlock(text, child, el, ctx);
}

function renderBlock(text: string, node: SyntaxNode, el: HTMLElement, ctx: RenderContext) {
  const heading = /^(?:ATX|Setext)Heading(\d)$/.exec(node.name);
  if (heading) {
    const h = el.createEl(`h${heading[1]}` as "h1");
    renderInlineChildren(text, node, h, ctx);
    // Leerraum der entfernten `# ` am Anfang nicht mitrendern.
    if (h.firstChild?.nodeType === Node.TEXT_NODE) h.firstChild.textContent = h.firstChild.textContent!.replace(/^\s+/, "");
    h.setAttr("data-heading", h.textContent ?? "");
    return;
  }

  switch (node.name) {
    case "Paragraph": {
      const p = el.createEl("p");
      renderInlineChildren(text, node, p, ctx);
      stripBlockId(p);
      return;
    }

    case "BulletList":
    case "OrderedList": {
      const list = el.createEl(node.name === "BulletList" ? "ul" : "ol");
      const firstMark = node.firstChild?.getChild("ListMark");
      const start = firstMark ? parseInt(text.slice(firstMark.from, firstMark.to), 10) : NaN;
      if (node.name === "OrderedList" && !Number.isNaN(start) && start !== 1) list.setAttr("start", start);
      for (let item = node.firstChild; item; item = item.nextSibling) {
        if (item.name === "ListItem") renderListItem(text, item, list, ctx);
      }
      return;
    }

    case "Blockquote": {
      const source = text.slice(node.from, node.to);
      const callout = parseCallout(source);
      if (callout) {
        renderCalloutShell(
          callout,
          el,
          (titleEl, title) => renderInline(title, titleEl, ctx),
          (bodyEl, body) => renderMarkdown(body, bodyEl, { ...ctx, depth: ctx.depth + 1 }),
        );
        return;
      }
      renderBlocks(text, node, el.createEl("blockquote"), ctx);
      return;
    }

    case "FencedCode":
    case "CodeBlock": {
      const info = node.getChild("CodeInfo");
      const lang = info ? text.slice(info.from, info.to).trim().split(/\s/)[0].toLowerCase() : "";
      const code = codeText(text, node);
      if (lang === "mermaid") return renderMermaid(code, el.createDiv());
      const pre = el.createEl("pre", { cls: lang ? `language-${lang}` : undefined });
      const codeEl = pre.createEl("code", { cls: lang ? `language-${lang}` : undefined, text: code });
      void highlightCodeElement(code, lang, codeEl);
      const copy = pre.createEl("button", { cls: "copy-code-button", text: "Kopieren" });
      copy.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        copyCode(code, copy, "Kopieren");
      });
      return;
    }

    case "HorizontalRule":
      el.createEl("hr");
      return;

    case "Table":
      renderTable(text.slice(node.from, node.to), el.createDiv("table-wrapper"), ctx);
      return;

    case "BlockMath":
      el.appendChild(renderMath(mathSource(text.slice(node.from, node.to)).tex, true));
      return;

    case "HTMLBlock":
      // Ohne Sanitizer kein HTML-Rendering; als Text zeigen statt still zu verschlucken.
      el.createEl("p", { text: text.slice(node.from, node.to) });
      return;

    case "Frontmatter":
    case "LinkReference":
    case "CommentBlock":
      return;

    default:
      if (node.firstChild) renderBlocks(text, node, el, ctx);
  }
}

function renderListItem(text: string, item: SyntaxNode, list: HTMLElement, ctx: RenderContext) {
  const li = list.createEl("li");
  for (let child = item.firstChild; child; child = child.nextSibling) {
    if (child.name === "ListMark") continue;
    if (child.name === "Task") {
      const marker = child.getChild("TaskMarker");
      const checked = marker ? /\[[^ ]\]/.test(text.slice(marker.from, marker.to)) : false;
      li.addClass("task-list-item");
      li.toggleClass("is-checked", checked);
      if (marker) li.setAttr("data-task", text.slice(marker.from + 1, marker.from + 2));
      const box = li.createEl("input", { type: "checkbox", cls: "task-list-item-checkbox" });
      box.checked = checked;
      const toggle = ctx.toggleTask;
      if (toggle && marker) {
        box.addEventListener("click", (evt) => {
          evt.preventDefault();
          toggle(marker.from, checked);
        });
      } else {
        box.disabled = true;
      }
      renderInlineChildren(text, child, li, ctx, marker ? marker.to : child.from);
      const first = box.nextSibling;
      if (first?.nodeType === Node.TEXT_NODE) first.textContent = first.textContent!.replace(/^\s+/, "");
      stripBlockId(li);
    } else if (child.name === "Paragraph") {
      // Enge Listen (ohne Leerzeilen) wie in Obsidian ohne <p>.
      renderInlineChildren(text, child, li, ctx);
      stripBlockId(li);
    } else {
      renderBlock(text, child, li, ctx);
    }
  }
}

function codeText(text: string, node: SyntaxNode): string {
  if (node.name === "CodeBlock") return text.slice(node.from, node.to).replace(/^ {4}/gm, "");
  const parts: string[] = [];
  for (let c = node.firstChild; c; c = c.nextSibling) if (c.name === "CodeText") parts.push(text.slice(c.from, c.to));
  return parts.join("");
}

/** Block-IDs (`^abc`) am Blockende werden in Obsidian nicht angezeigt. */
function stripBlockId(el: HTMLElement) {
  const last = el.lastChild;
  if (last?.nodeType === Node.TEXT_NODE) last.textContent = last.textContent!.replace(/\s*\^[A-Za-z0-9-]+\s*$/, "");
}
