import { Component } from "../core/component";
import { setIcon } from "./icons";

export class MenuItem {
  dom: HTMLElement;
  private iconEl: HTMLElement;
  private titleEl: HTMLElement;
  private callback: ((evt: MouseEvent | KeyboardEvent) => unknown) | null = null;
  private submenu: Menu | null = null;

  constructor(private menu: Menu) {
    this.dom = menu.dom.createDiv("menu-item");
    this.iconEl = this.dom.createDiv("menu-item-icon");
    this.titleEl = this.dom.createDiv("menu-item-title");
    this.dom.addEventListener("click", (evt) => {
      if (this.dom.hasClass("is-disabled")) return;
      if (this.submenu) return this.openSubmenu();
      this.menu.hide();
      this.callback?.(evt);
    });
    this.dom.addEventListener("mouseenter", () => {
      this.menu.closeSubmenus(this.submenu);
      if (this.submenu && !this.dom.hasClass("is-disabled")) this.openSubmenu();
    });
  }

  /** Untermenü, das beim Überfahren rechts neben dem Eintrag aufgeht (Obsidians `setSubmenu`). */
  setSubmenu(): Menu {
    if (!this.submenu) {
      this.submenu = new Menu();
      this.submenu.parentMenu = this.menu;
      this.menu.submenus.push(this.submenu);
      this.dom.addClass("has-submenu");
      setIcon(this.dom.createDiv("menu-item-icon mod-submenu"), "chevron-right");
    }
    return this.submenu;
  }

  private openSubmenu() {
    const submenu = this.submenu!;
    if (submenu.dom.isConnected) return;
    const rect = this.dom.getBoundingClientRect();
    submenu.showAtPosition({ x: rect.right, y: rect.top - 4 });
    if (submenu.dom.getBoundingClientRect().left < rect.right - 1) {
      // Kein Platz rechts: links vom Menü öffnen.
      submenu.dom.style.left = `${Math.max(0, rect.left - submenu.dom.offsetWidth)}px`;
    }
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
  /** @internal */
  parentMenu: Menu | null = null;
  /** @internal */
  submenus: Menu[] = [];
  private hideCallbacks: (() => unknown)[] = [];
  private onOutside = (evt: MouseEvent) => {
    if (!this.contains(evt.target as Node)) this.root().hide();
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
    this.dom.style.left = `${Math.max(0, Math.min(pos.x, window.innerWidth - width - 4))}px`;
    this.dom.style.top = `${Math.max(0, Math.min(pos.y, window.innerHeight - height - 4))}px`;
    if (!this.parentMenu) setTimeout(() => document.addEventListener("mousedown", this.onOutside), 0);
    this.load();
    return this;
  }

  hide(): this {
    if (!this.dom.isConnected) return this;
    this.closeSubmenus(null);
    document.removeEventListener("mousedown", this.onOutside);
    this.dom.detach();
    this.unload();
    for (const cb of this.hideCallbacks) cb();
    // Ein Klick in einem Untermenü schließt das ganze Menü.
    this.parentMenu?.hide();
    return this;
  }

  /** @internal Offene Untermenüs schließen, außer `keep`. */
  closeSubmenus(keep: Menu | null): void {
    for (const submenu of this.submenus) {
      if (submenu === keep || !submenu.dom.isConnected) continue;
      const parent = submenu.parentMenu;
      submenu.parentMenu = null; // nur das Untermenü schließen, nicht den Elternteil
      submenu.hide();
      submenu.parentMenu = parent;
    }
  }

  private contains(node: Node): boolean {
    return this.dom.contains(node) || this.submenus.some((s) => s.contains(node));
  }

  private root(): Menu {
    return this.parentMenu ? this.parentMenu.root() : this;
  }

  onHide(callback: () => unknown): void {
    this.hideCallbacks.push(callback);
  }
}
