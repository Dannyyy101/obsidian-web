import { type EditorView, WidgetType } from "@codemirror/view";
import { isExternalUrl, type LivePreviewHost } from "./host";
import { copyCode } from "../render/code";
import type { RenderContext } from "../render/context";
import { renderEmbed } from "../render/embed";
import { renderMarkdown } from "../render/markdown";
import { renderMath } from "../render/math";
import { renderMermaid } from "../render/mermaid";

/** Öffnet den Link eines angeklickten `.internal-link`/`.external-link`. */
export function followLink(el: HTMLElement, host: LivePreviewHost, evt: MouseEvent): boolean {
  const href = el.getAttribute("data-href");
  if (!href) return false;
  evt.preventDefault();
  if (isExternalUrl(href)) window.open(href, "_blank", "noopener");
  else host.openLink(decodeURI(href), evt.metaKey || evt.ctrlKey, el.getAttribute("data-source-path") ?? undefined);
  return true;
}

export class LinkWidget extends WidgetType {
  constructor(
    private display: string,
    private target: string,
    private resolved: boolean,
    private host: LivePreviewHost,
  ) {
    super();
  }

  eq(other: LinkWidget) {
    return other.display === this.display && other.target === this.target && other.resolved === this.resolved;
  }

  toDOM() {
    const el = createSpan({
      cls: ["cm-hmd-internal-link", "internal-link", ...(this.resolved ? [] : ["is-unresolved"])],
      text: this.display,
      attr: { "data-href": this.target },
    });
    el.addEventListener("mousedown", (evt) => evt.button === 0 && followLink(el, this.host, evt));
    return el;
  }

  ignoreEvent() {
    return true;
  }
}

export class BulletWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    return createSpan("list-bullet"); // Punkt per CSS, wie in Obsidian
  }
}

export class CheckboxWidget extends WidgetType {
  constructor(private checked: boolean) {
    super();
  }

  eq(other: CheckboxWidget) {
    return other.checked === this.checked;
  }

  toDOM(view: EditorView) {
    const input = createEl("input", { type: "checkbox", cls: "task-list-item-checkbox" });
    input.checked = this.checked;
    input.addEventListener("mousedown", (evt) => evt.preventDefault());
    input.addEventListener("click", (evt) => {
      evt.preventDefault();
      // Das Widget ersetzt `[ ]` bzw. `[x]`; das Zeichen in der Mitte umschalten.
      const pos = view.posAtDOM(input);
      view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: this.checked ? " " : "x" } });
    });
    return input;
  }

  ignoreEvent() {
    return true;
  }
}

/** Sprache und Kopieren-Knopf in der ersten Zeile eines Codeblocks. */
export class CodeFlairWidget extends WidgetType {
  constructor(
    private lang: string,
    private code: string,
  ) {
    super();
  }

  eq(other: CodeFlairWidget) {
    return other.lang === this.lang && other.code === this.code;
  }

  toDOM() {
    const wrap = createSpan("code-block-flair-wrapper");
    if (this.lang) wrap.createSpan({ cls: "code-block-flair-lang", text: this.lang });
    const button = wrap.createSpan({ cls: "code-block-flair", text: "Kopieren", attr: { "aria-label": "Code kopieren" } });
    button.addEventListener("mousedown", (evt) => evt.preventDefault());
    button.addEventListener("click", (evt) => {
      evt.preventDefault();
      copyCode(this.code, button, "Kopieren");
    });
    return wrap;
  }

  ignoreEvent(evt: Event) {
    return (evt.target as HTMLElement).closest?.(".code-block-flair") != null;
  }
}

/** `[^label]` als hochgestellter Verweis; der Tooltip zeigt die Definition. */
export class FootnoteRefWidget extends WidgetType {
  constructor(
    private label: string,
    private definition: string,
  ) {
    super();
  }

  eq(other: FootnoteRefWidget) {
    return other.label === this.label && other.definition === this.definition;
  }

  toDOM() {
    const sup = createEl("sup", { cls: "footnote-ref cm-footref", text: `[${this.label}]` });
    if (this.definition) sup.setAttr("title", this.definition);
    return sup;
  }
}

export class HrWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    return createEl("hr");
  }
}

export class ImageWidget extends WidgetType {
  constructor(
    private src: string,
    private alt: string,
    private width: number | null,
    private host: LivePreviewHost,
  ) {
    super();
  }

  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt && other.width === this.width;
  }

  toDOM() {
    const wrap = createSpan("image-embed");
    const img = wrap.createEl("img", { attr: { alt: this.alt } });
    if (this.width) img.width = this.width;
    if (isExternalUrl(this.src)) img.src = this.src;
    else {
      void this.host.loadResource(this.src).then((url) => {
        if (url) {
          img.src = url;
        } else {
          wrap.setText(`Bild nicht gefunden: ${this.src}`);
          wrap.addClass("is-unresolved");
        }
      });
    }
    return wrap;
  }
}

/** Kontext für Renderer innerhalb der Live Preview (Links gelten relativ zur geöffneten Datei). */
function widgetContext(host: LivePreviewHost): RenderContext {
  // depth 1: Links behandelt das Widget selbst (mousedown), nicht der Renderer.
  return { host, sourcePath: "", depth: 1, embedded: new Set() };
}

/**
 * Gerenderter Block (Callout, Diagramm, Embed). Klick auf einen Link folgt ihm, Klick
 * auf Bedienelemente (Einklappen, Medien) wirkt dort; sonst springt der Cursor in die Quelle.
 */
abstract class RenderedWidget extends WidgetType {
  constructor(
    protected source: string,
    protected host: LivePreviewHost,
  ) {
    super();
  }

  protected abstract cls: string;
  protected abstract render(el: HTMLElement): void;

  eq(other: RenderedWidget) {
    return other.constructor === this.constructor && other.source === this.source;
  }

  toDOM(view: EditorView) {
    const wrap = createDiv(this.cls);
    this.render(wrap);
    wrap.addEventListener("mousedown", (evt) => {
      const target = evt.target as HTMLElement;
      const link = target.closest<HTMLElement>(".internal-link, .external-link");
      if (link && followLink(link, this.host, evt)) return;
      if (target.closest(".callout.is-collapsible > .callout-title, .markdown-embed-link, audio, video, iframe")) {
        evt.preventDefault();
        return;
      }
      evt.preventDefault();
      view.dispatch({ selection: { anchor: view.posAtDOM(wrap) } });
      view.focus();
    });
    return wrap;
  }

  ignoreEvent() {
    return true;
  }
}

export class CalloutWidget extends RenderedWidget {
  protected cls = "cm-callout markdown-rendered";
  protected render(el: HTMLElement) {
    renderMarkdown(this.source, el, widgetContext(this.host));
  }
}

export class MermaidWidget extends RenderedWidget {
  protected cls = "cm-mermaid-widget";
  protected render(el: HTMLElement) {
    renderMermaid(this.source, el);
  }
}

/** `![[Notiz]]`, `![[Notiz#Abschnitt]]`, Audio, Video, PDF (Bilder: ImageWidget). */
export class EmbedWidget extends RenderedWidget {
  protected cls = "cm-embed-widget markdown-rendered";
  protected render(el: HTMLElement) {
    renderEmbed(this.source, el, widgetContext(this.host));
  }
}

/** Gerenderte Formel. Ein Klick setzt den Cursor hinein und zeigt so die LaTeX-Quelle. */
export class MathWidget extends WidgetType {
  constructor(
    private tex: string,
    private display: boolean,
  ) {
    super();
  }

  eq(other: MathWidget) {
    return other.tex === this.tex && other.display === this.display;
  }

  toDOM(view: EditorView) {
    const el = renderMath(this.tex, this.display);
    if (this.display) el.addClass("cm-math-block-widget");
    el.addEventListener("mousedown", (evt) => {
      evt.preventDefault();
      // Hinter den öffnenden Begrenzer, damit die Quelle sichtbar wird.
      view.dispatch({ selection: { anchor: view.posAtDOM(el) + (this.display ? 2 : 1) } });
      view.focus();
    });
    return el;
  }

  ignoreEvent() {
    return true;
  }
}
