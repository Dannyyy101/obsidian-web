import type { EventRef } from "../shared/events";

/** Entspricht Obsidians `Component`: Lebenszyklus mit automatischem Aufräumen. */
export class Component {
  private _loaded = false;
  private _children: Component[] = [];
  private _cleanups: (() => unknown)[] = [];
  /** @internal Ergebnis eines asynchronen `onload` (Plugins), damit der Loader darauf warten kann. */
  _loading: Promise<void> = Promise.resolve();

  load(): void {
    if (this._loaded) return;
    this._loaded = true;
    this._loading = Promise.resolve(this.onload());
    for (const child of this._children) child.load();
  }

  onload(): void | Promise<void> {}

  unload(): void {
    if (!this._loaded) return;
    this._loaded = false;
    for (const child of this._children.splice(0)) child.unload();
    for (const cleanup of this._cleanups.splice(0).reverse()) cleanup();
    this.onunload();
  }

  onunload(): void {}

  addChild<T extends Component>(component: T): T {
    this._children.push(component);
    if (this._loaded) component.load();
    return component;
  }

  removeChild<T extends Component>(component: T): T {
    this._children = this._children.filter((c) => c !== component);
    component.unload();
    return component;
  }

  register(cb: () => unknown): void {
    this._cleanups.push(cb);
  }

  registerEvent(ref: EventRef): void {
    this.register(() => ref.e.offref(ref));
  }

  registerDomEvent(
    el: EventTarget,
    type: string,
    callback: (evt: any) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void {
    el.addEventListener(type, callback, options);
    this.register(() => el.removeEventListener(type, callback, options));
  }

  registerInterval(id: number): number {
    this.register(() => clearInterval(id));
    return id;
  }
}
