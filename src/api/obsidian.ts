// Das Modul `obsidian`, das Community-Plugins per `require("obsidian")` erhalten.
// Umfang wächst mit den unterstützten Plugins; Referenz ist obsidian.d.ts aus obsidianmd/obsidian-api.
import moment from "moment";
import { loadKatex, renderMath as renderKatex } from "../editor/render/math";

export type { App } from "../app/app";
export { Commands } from "../core/commands";
export { Component } from "../core/component";
export { FileManager } from "../core/file-manager";
import { parseLinktext } from "../core/metadata-cache";
import { type CachedMetadata, frontmatterTags, getAllTags as allTags } from "../markdown/metadata";
export { MetadataCache, parseLinktext } from "../core/metadata-cache";
export { parseFrontMatterAliases, parseFrontMatterEntry, parseFrontMatterStringArray, parseYaml } from "../markdown/metadata";
export { Editor } from "../editor/editor";
export { MarkdownView } from "../ui/markdown-view";
export { TAbstractFile, TFile, TFolder, Vault } from "../core/vault";
export { editorInfoField, editorLivePreviewField, livePreviewState } from "../editor/fields";
export { Events } from "../shared/events";
export { normalizePath } from "../shared/path";
export { addIcon, getIcon, getIconIds, removeIcon, setIcon } from "../ui/icons";
export { Keymap, Scope } from "../ui/keymap";
export { Menu, MenuItem } from "../ui/menu";
export { Modal } from "../ui/modal";
export { Notice } from "../ui/notice";
export {
  AbstractTextComponent,
  BaseComponent,
  ButtonComponent,
  DropdownComponent,
  ExtraButtonComponent,
  SearchComponent,
  Setting,
  SliderComponent,
  TextAreaComponent,
  TextComponent,
  ToggleComponent,
  ValueComponent,
} from "../ui/setting";
export { AbstractInputSuggest, PopoverSuggest } from "../ui/suggest";
export { Workspace } from "../ui/workspace";
export { MarkdownRenderer, sanitizeHTMLToDom } from "./markdown-renderer";
export { apiVersion, Platform, requireApiVersion } from "./platform";
export { Plugin, PluginSettingTab, SettingTab } from "./plugin";
export type { PluginManifest } from "./plugin";
export { request, requestUrl } from "./request-url";
export { moment };

/** Nur für `instanceof`-Prüfungen: obsidian-web hat kein Dateisystem im Sinne von Node. */
export class FileSystemAdapter {}

/** Alle Tags (Text und Frontmatter) mit `#`, oder null ohne Metadaten. */
export function getAllTags(cache: CachedMetadata | null | undefined): string[] | null {
  return cache ? allTags(cache) : null;
}

/** Tags aus dem Frontmatter (`tags`/`tag`) mit `#`, oder null. */
export function parseFrontMatterTags(frontmatter: Record<string, unknown> | null | undefined): string[] | null {
  const tags = frontmatterTags(frontmatter ?? undefined);
  return tags.length ? tags : null;
}

/** Linkziel ohne `#Abschnitt`/`#^Block`. */
export function getLinkpath(linktext: string): string {
  return parseLinktext(linktext).path;
}

// Obsidian rendert Formeln mit MathJax, obsidian-web mit KaTeX. Die API bleibt dieselbe.
/** Lädt den Formel-Renderer; danach rendert `renderMath` synchron. */
export async function loadMathJax(): Promise<void> {
  await loadKatex();
}

/** Rendert TeX (ohne `$`-Begrenzer) als Inline- oder Blockformel. */
export function renderMath(source: string, display: boolean): HTMLElement {
  return renderKatex(source, display);
}

/** Bei MathJax nötig, um Stylesheets nachzuziehen; KaTeX bringt sein CSS selbst mit. */
export async function finishRenderMath(): Promise<void> {}

export function debounce<T extends unknown[]>(cb: (...args: T) => unknown, timeout = 0, resetTimer = false) {
  let timer: number | undefined;
  let pending: T | null = null;
  const debounced = (...args: T) => {
    pending = args;
    if (timer !== undefined && !resetTimer) return debounced;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = undefined;
      const a = pending!;
      pending = null;
      cb(...a);
    }, timeout);
    return debounced;
  };
  debounced.cancel = () => {
    window.clearTimeout(timer);
    timer = undefined;
    return debounced;
  };
  debounced.run = () => {
    if (pending) cb(...pending);
    return debounced.cancel();
  };
  return debounced;
}
