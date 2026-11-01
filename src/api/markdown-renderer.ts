import type { App } from "../app/app";
import type { Component } from "../core/component";
import { type LivePreviewHost, resourceUrl } from "../editor/live-preview/host";
import { renderMarkdown } from "../editor/render/markdown";

/** Linkauflösung, Embeds und Vault-Ressourcen für gerendertes Markdown; deren URLs leben so lange wie `component`. */
function renderHost(app: App, component: Component): LivePreviewHost {
  const urls: string[] = [];
  component.register(() => urls.forEach((url) => URL.revokeObjectURL(url)));
  const resolve = (linkpath: string, sourcePath = "") => app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
  return {
    openLink: (linktext, newTab, sourcePath) => void app.workspace.openLinkText(linktext, sourcePath ?? "", newTab),
    isResolved: (linktext, sourcePath) => !!resolve(linktext, sourcePath),
    loadResource: async (linkpath, sourcePath) => {
      const file = resolve(linkpath, sourcePath);
      if (!file) return null;
      const url = resourceUrl(await app.vault.readBinary(file), file.extension);
      urls.push(url);
      return url;
    },
    loadNote: async (linkpath, sourcePath) => {
      const file = resolve(linkpath, sourcePath);
      return file && file.extension === "md" ? { path: file.path, content: await app.vault.cachedRead(file) } : null;
    },
  };
}

/** Entspricht Obsidians `MarkdownRenderer`: rendert Markdown wie im Lesemodus in ein Element. */
export class MarkdownRenderer {
  static async render(app: App, markdown: string, el: HTMLElement, sourcePath: string, component: Component): Promise<void> {
    renderMarkdown(markdown, el, { host: renderHost(app, component), sourcePath, depth: 0, embedded: new Set([sourcePath]) });
  }

  /** @deprecated Wie in Obsidian: nutzt das globale `app`. */
  static async renderMarkdown(markdown: string, el: HTMLElement, sourcePath: string, component: Component): Promise<void> {
    return MarkdownRenderer.render((window as unknown as { app: App }).app, markdown, el, sourcePath, component);
  }
}

// SVG-Animationen können `href` nachträglich auf `javascript:` setzen.
const FORBIDDEN_TAGS = new Set([
  "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "BASE", "FORM", "FRAME", "FRAMESET",
  "ANIMATE", "SET", "ANIMATEMOTION", "ANIMATETRANSFORM", "HANDLER",
]);
const URL_ATTRS = new Set(["href", "src", "xlink:href", "action", "formaction"]);
const SAFE_PROTOCOLS = new Set(["http", "https", "mailto", "tel", "obsidian"]);

/** URL ohne Schema (relativ, `#anker`) oder mit einem Schema aus `SAFE_PROTOCOLS`. */
function isSafeUrl(value: string): boolean {
  // Wie der URL-Parser des Browsers: Steuerzeichen und Leerzeichen zählen nicht, `jav\tascript:` ist `javascript:`.
  const scheme = /^([^:/?#]*):/.exec(value.replace(/[\u0000- ]/g, ""))?.[1];
  return scheme === undefined || SAFE_PROTOCOLS.has(scheme.toLowerCase());
}

/** Entspricht Obsidians `sanitizeHTMLToDom`: HTML ohne Skripte, Event-Handler und unsichere URLs. */
export function sanitizeHTMLToDom(html: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const el of Array.from(template.content.querySelectorAll("*"))) {
    if (FORBIDDEN_TAGS.has(el.tagName.toUpperCase())) {
      el.remove();
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || (URL_ATTRS.has(name) && !isSafeUrl(attr.value))) el.removeAttribute(attr.name);
    }
  }
  return template.content;
}
