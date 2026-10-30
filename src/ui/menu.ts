import { Component } from "../core/component";
import { setIcon } from "./icons";

export class MenuItem {
  dom: HTMLElement;
  private iconEl: HTMLElement;
  private titleEl: HTMLElement;
  private callback: ((evt: MouseEvent | KeyboardEvent) => unknown) | null = null;

  constructor(private menu: Menu) {
    this.dom = menu.dom.createDiv("menu-item");
    this.iconEl = this.dom.createDiv("menu-item-icon");
    this.titleEl = this.dom.createDiv("menu-item-title");
    this.dom.addEventListener("click", (evt) => {
      if (this.dom.hasClass("is-disabled")) return;
      this.menu.hide();
      this.callback?.(evt);
    });
  }

  setTitle(title: string | DocumentFragment): this {
    this.titleEl.setText(title);
    return this;
  }

  setIcon(icon: string | null): this {
    if (icon) setIcon(this.iconEl, icon);
    else this.iconEl.empty();
    return this;
  }

  setChecked(checked: boolean | null): this {
    this.dom.toggleClass("mod-checked", !!checked);
    return this;
  }

  setDisabled(disabled: boolean): this {
    this.dom.toggleClass("is-disabled", disabled);
    return this;
  }

  setWarning(warning: boolean): this {
    this.dom.toggleClass("mod-warning", warning);
    return this;
  }

  setIsLabel(isLabel: boolean): this {
    this.dom.toggleClass("is-label", isLabel);
    return this;
  }

  setSection(_section: string): this {
    return this;
  }

  onClick(callback: (evt: MouseEvent | KeyboardEvent) => unknown): this {
    this.callback = callback;
    return this;
  }
}

/** Entspricht Obsidians `Menu` (Kontextmenü). */
export class Menu extends Component {
  dom: HTMLElement;
  private hideCallbacks: (() => unknown)[] = [];
  private onOutside = (evt: MouseEvent) => {
    if (!this.dom.contains(evt.target as Node)) this.hide();
  };

  constructor() {
    super();
    this.dom = createDiv("menu");
  }

  addItem(cb: (item: MenuItem) => unknown): this {
    cb(new MenuItem(this));
    return this;
  }

  addSeparator(): this {
    this.dom.createDiv("menu-separator");
    return this;
  }

  showAtMouseEvent(evt: MouseEvent): this {
    evt.preventDefault();
    return this.showAtPosition({ x: evt.clientX, y: evt.clientY });
  }

  showAtPosition(pos: { x: number; y: number }): this {
    document.body.appendChild(this.dom);
    const { width, height } = this.dom.getBoundingClientRect();
    this.dom.style.left = `${Math.min(pos.x, window.innerWidth - width - 4)}px`;
    this.dom.style.top = `${Math.min(pos.y, window.innerHeight - height - 4)}px`;
    setTimeout(() => document.addEventListener("mousedown", this.onOutside), 0);
    this.load();
    return this;
  }

  hide(): this {
    document.removeEventListener("mousedown", this.onOutside);
    this.dom.detach();
    this.unload();
    for (const cb of this.hideCallbacks) cb();
    return this;
  }

  onHide(callback: () => unknown): void {
    this.hideCallbacks.push(callback);
  }
}
