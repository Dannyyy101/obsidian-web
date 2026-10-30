import { parseLinktext } from "../../core/metadata-cache";
import { extractSection } from "../../markdown/sections";
import { setIcon } from "../../ui/icons";
import { AUDIO_EXTENSIONS, extensionOf, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from "../live-preview/host";
import { MAX_EMBED_DEPTH, type RenderContext } from "./context";
import { renderMarkdown } from "./markdown";

function unresolved(el: HTMLElement, message: string) {
  el.empty();
  el.addClass("is-unresolved");
  el.createDiv({ cls: "embed-message", text: message });
}

/**
 * `![[ziel|alias]]`: Bild, Audio, Video, PDF oder Notiz(-abschnitt). Beim Alias zählt bei Bildern
 * eine Breite (`|300` oder `|300x200`).
 */
export function renderEmbed(inner: string, parent: HTMLElement, ctx: RenderContext): HTMLElement {
  const pipe = inner.indexOf("|");
  const linktext = pipe < 0 ? inner : inner.slice(0, pipe);
  const alias = pipe < 0 ? "" : inner.slice(pipe + 1);
  const { path, subpath } = parseLinktext(linktext);
  const ext = extensionOf(path);
  const { host, sourcePath } = ctx;

  if (IMAGE_EXTENSIONS.has(ext)) {
    const el = parent.createSpan({ cls: "internal-embed image-embed", attr: { src: linktext } });
    const img = el.createEl("img", { attr: { alt: alias && !/^\d+(x\d+)?$/.test(alias) ? alias : path } });
    const size = /^(\d+)(?:x(\d+))?$/.exec(alias);
    if (size) {
      img.width = Number(size[1]);
      if (size[2]) img.height = Number(size[2]);
    }
    void host.loadResource(path, sourcePath).then((url) => (url ? (img.src = url) : unresolved(el, `„${path}“ wurde nicht gefunden.`)));
    return el;
  }

  if (AUDIO_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext) || ext === "pdf") {
    const el = parent.createDiv({ cls: ["internal-embed", `${ext === "pdf" ? "pdf" : AUDIO_EXTENSIONS.has(ext) ? "audio" : "video"}-embed`], attr: { src: linktext } });
    void host.loadResource(path, sourcePath).then((url) => {
      if (!url) return unresolved(el, `„${path}“ wurde nicht gefunden.`);
      if (ext === "pdf") el.createEl("iframe", { attr: { src: `${url}${subpath}` } });
      else el.createEl(AUDIO_EXTENSIONS.has(ext) ? "audio" : "video", { attr: { src: url, controls: true } });
    });
    return el;
  }

  // Notiz oder Abschnitt einer Notiz.
  const el = parent.createDiv({ cls: "internal-embed markdown-embed inline-embed", attr: { src: linktext } });
  const open = el.createDiv({ cls: "markdown-embed-link", attr: { "aria-label": "Notiz öffnen" } });
  setIcon(open, "link");
  open.addEventListener("mousedown", (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    host.openLink(linktext, evt.metaKey || evt.ctrlKey, sourcePath);
  });
  const content = el.createDiv("markdown-embed-content");
  if (ctx.depth >= MAX_EMBED_DEPTH) {
    unresolved(content, "Zu tief verschachtelt.");
    return el;
  }
  void host.loadNote(path, sourcePath).then((note) => {
    if (!note) return unresolved(content, `„${path || linktext}“ wurde nicht gefunden.`);
    const key = `${note.path}${subpath}`;
    if (ctx.embedded.has(key)) return unresolved(content, "Diese Notiz bettet sich selbst ein.");
    const section = extractSection(note.content, subpath);
    if (section === null) return unresolved(content, `Abschnitt „${subpath}“ wurde nicht gefunden.`);
    renderMarkdown(section, content, {
      host,
      sourcePath: note.path,
      depth: ctx.depth + 1,
      embedded: new Set([...ctx.embedded, key]),
    });
  });
  return el;
}
