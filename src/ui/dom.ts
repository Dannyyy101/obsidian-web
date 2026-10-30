// Obsidians DOM-Erweiterungen (createEl, empty, toggleClass …) als Prototyp-Methoden und Globals.
// Community-Plugins setzen sie voraus.
import { installGlobalExtensions } from "../shared/globals";

export interface DomElementInfo {
  cls?: string | string[];
  text?: string | DocumentFragment;
  attr?: Record<string, string | number | boolean | null>;
  title?: string;
  parent?: Node;
  value?: string;
  type?: string;
  prepend?: boolean;
  placeholder?: string;
  href?: string;
}

type ElCallback<T> = (el: T) => void;

declare global {
  interface Node {
    empty(): void;
    detach(): void;
    createEl<K extends keyof HTMLElementTagNameMap>(
      tag: K,
      o?: DomElementInfo | string,
      callback?: ElCallback<HTMLElementTagNameMap[K]>,
    ): HTMLElementTagNameMap[K];
    createDiv(o?: DomElementInfo | string, callback?: ElCallback<HTMLDivElement>): HTMLDivElement;
    createSpan(o?: DomElementInfo | string, callback?: ElCallback<HTMLSpanElement>): HTMLSpanElement;
    appendText(text: string): void;
  }
  interface Element {
    addClass(...classes: string[]): void;
    removeClass(...classes: string[]): void;
    toggleClass(classes: string | string[], value: boolean): void;
    hasClass(cls: string): boolean;
    setText(text: string | DocumentFragment): void;
    setAttr(name: string, value: string | number | boolean | null): void;
    setAttrs(obj: Record<string, string | number | boolean | null>): void;
    getText(): string;
  }
  interface HTMLElement {
    show(): void;
    hide(): void;
    toggle(show: boolean): void;
    isShown(): boolean;
  }
  function createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    o?: DomElementInfo | string,
    callback?: ElCallback<HTMLElementTagNameMap[K]>,
  ): HTMLElementTagNameMap[K];
  function createDiv(o?: DomElementInfo | string, callback?: ElCallback<HTMLDivElement>): HTMLDivElement;
  function createSpan(o?: DomElementInfo | string, callback?: ElCallback<HTMLSpanElement>): HTMLSpanElement;
  function createFragment(callback?: ElCallback<DocumentFragment>): DocumentFragment;
  function sleep(ms: number): Promise<void>;
  var activeWindow: Window;
  var activeDocument: Document;
}

function applyInfo(el: HTMLElement, o?: DomElementInfo | string) {
  if (o === undefined) return;
  const info: DomElementInfo = typeof o === "string" ? { cls: o } : o;
  if (info.cls) el.addClass(...(Array.isArray(info.cls) ? info.cls : info.cls.split(" ").filter(Boolean)));
  if (info.text !== undefined) el.setText(info.text);
  if (info.attr) el.setAttrs(info.attr);
  if (info.title !== undefined) el.title = info.title;
  if (info.value !== undefined) (el as HTMLInputElement).value = info.value;
  if (info.type !== undefined) (el as HTMLInputElement).type = info.type;
  if (info.placeholder !== undefined) (el as HTMLInputElement).placeholder = info.placeholder;
  if (info.href !== undefined) (el as HTMLAnchorElement).href = info.href;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  o?: DomElementInfo | string,
  callback?: ElCallback<HTMLElementTagNameMap[K]>,
  parent?: Node,
) {
  const el = document.createElement(tag);
  applyInfo(el, o);
  const target = parent ?? (typeof o === "object" ? o.parent : undefined);
  if (target) {
    if (typeof o === "object" && o.prepend) target.insertBefore(el, target.firstChild);
    else target.appendChild(el);
  }
  callback?.(el);
  return el;
}

export function installDomExtensions() {
  // Die Erweiterungen von String, Array, Math … gehören zur selben globalen Plugin-Umgebung.
  installGlobalExtensions();

  const node = Node.prototype;
  node.empty = function () {
    while (this.firstChild) this.removeChild(this.firstChild);
  };
  node.detach = function () {
    this.parentNode?.removeChild(this);
  };
  node.createEl = function (tag, o, callback) {
    return createElement(tag, o, callback, this);
  };
  node.createDiv = function (o, callback) {
    return createElement("div", o, callback, this);
  };
  node.createSpan = function (o, callback) {
    return createElement("span", o, callback, this);
  };
  node.appendText = function (text) {
    this.appendChild(document.createTextNode(text));
  };

  const el = Element.prototype;
  el.addClass = function (...classes) {
    this.classList.add(...classes.filter(Boolean));
  };
  el.removeClass = function (...classes) {
    this.classList.remove(...classes.filter(Boolean));
  };
  el.toggleClass = function (classes, value) {
    for (const cls of Array.isArray(classes) ? classes : [classes]) this.classList.toggle(cls, value);
  };
  el.hasClass = function (cls) {
    return this.classList.contains(cls);
  };
  el.setText = function (text) {
    this.empty();
    if (typeof text === "string") this.textContent = text;
    else this.appendChild(text);
  };
  el.setAttr = function (name, value) {
    if (value === null || value === false) this.removeAttribute(name);
    else this.setAttribute(name, String(value));
  };
  el.setAttrs = function (obj) {
    for (const [k, v] of Object.entries(obj)) this.setAttr(k, v);
  };
  el.getText = function () {
    return this.textContent ?? "";
  };

  const html = HTMLElement.prototype;
  html.show = function () {
    this.style.display = "";
  };
  html.hide = function () {
    this.style.display = "none";
  };
  html.toggle = function (show) {
    this.style.display = show ? "" : "none";
  };
  html.isShown = function () {
    return this.style.display !== "none" && this.isConnected;
  };

  const g = globalThis as any;
  g.createEl = (tag: any, o?: any, cb?: any) => createElement(tag, o, cb);
  g.createDiv = (o?: any, cb?: any) => createElement("div", o, cb);
  g.createSpan = (o?: any, cb?: any) => createElement("span", o, cb);
  g.createFragment = (cb?: ElCallback<DocumentFragment>) => {
    const frag = document.createDocumentFragment();
    cb?.(frag);
    return frag;
  };
  g.sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  g.activeWindow = window;
  g.activeDocument = document;
}
