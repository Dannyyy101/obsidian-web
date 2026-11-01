import { type Modifier, normalizeModifiers } from "../core/hotkeys";

export type { Modifier };

export interface KeymapContext {
  modifiers: string | null;
  key: string | null;
  vkey: string;
}

/** Rückgabe `false` verhindert die Standardaktion des Browsers (wie in Obsidian). */
export type KeymapEventListener = (evt: KeyboardEvent, ctx: KeymapContext) => false | unknown;

export interface KeymapEventHandler {
  scope: Scope;
  modifiers: string | null;
  key: string | null;
  func: KeymapEventListener;
}

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

/** Modifier eines Ereignisses in Obsidians Schreibweise, z. B. `"Mod,Shift"` (Mod = Cmd bzw. Strg). */
export function eventModifiers(evt: KeyboardEvent): string {
  const mods: string[] = [];
  if (isMac ? evt.metaKey : evt.ctrlKey) mods.push("Mod");
  if (isMac && evt.ctrlKey) mods.push("Ctrl");
  if (!isMac && evt.metaKey) mods.push("Meta");
  if (evt.shiftKey) mods.push("Shift");
  if (evt.altKey) mods.push("Alt");
  return mods.join(",");
}

/** Entspricht Obsidians `Scope`: Tastenkürzel, die gelten, solange der Scope oben auf dem Stapel liegt. */
export class Scope {
  /** @internal */
  keys: KeymapEventHandler[] = [];

  constructor(private parent?: Scope) {}

  /** `modifiers`/`key` null = jede Kombination bzw. jede Taste. */
  register(modifiers: Modifier[] | null, key: string | null, func: KeymapEventListener): KeymapEventHandler {
    const handler: KeymapEventHandler = { scope: this, modifiers: modifiers && normalizeModifiers(modifiers, isMac), key, func };
    this.keys.push(handler);
    return handler;
  }

  unregister(handler: KeymapEventHandler): void {
    this.keys.remove(handler);
  }

  /** @internal Liefert true, wenn ein Handler das Ereignis übernommen hat. */
  handleKey(evt: KeyboardEvent, ctx: KeymapContext): boolean {
    for (const handler of this.keys) {
      if (handler.modifiers !== null && handler.modifiers !== ctx.modifiers) continue;
      if (handler.key !== null && handler.key.toLowerCase() !== ctx.key?.toLowerCase()) continue;
      if (handler.func(evt, ctx) === false) evt.preventDefault();
      return true;
    }
    return this.parent?.handleKey(evt, ctx) ?? false;
  }
}

/** Entspricht Obsidians `Keymap` (`app.keymap`): Stapel aktiver Scopes, der oberste bekommt die Tasten. */
export class Keymap {
  private scopes: Scope[] = [];

  constructor() {
    document.addEventListener("keydown", (evt) => this.onKeyDown(evt), true);
  }

  pushScope(scope: Scope): void {
    this.scopes.remove(scope);
    this.scopes.push(scope);
  }

  popScope(scope: Scope): void {
    this.scopes.remove(scope);
  }

  private onKeyDown(evt: KeyboardEvent) {
    const scope = this.scopes.last();
    if (!scope || evt.isComposing) return;
    const ctx: KeymapContext = { modifiers: eventModifiers(evt), key: evt.key, vkey: evt.code };
    if (scope.handleKey(evt, ctx)) evt.stopPropagation();
  }

  static isModifier(evt: MouseEvent | TouchEvent | KeyboardEvent, modifier: Modifier): boolean {
    const e = evt as KeyboardEvent;
    switch (modifier) {
      case "Mod":
        return isMac ? e.metaKey : e.ctrlKey;
      case "Ctrl":
        return e.ctrlKey;
      case "Meta":
        return e.metaKey;
      case "Shift":
        return e.shiftKey;
      case "Alt":
        return e.altKey;
    }
  }

  /** Wie Obsidian: Mod oder Mittelklick → neuer Tab, Mod+Alt → Split, Mod+Alt+Shift → Fenster. */
  static isModEvent(evt?: UserEvent | null): boolean | "tab" | "split" | "window" {
    if (!evt) return false;
    const e = evt as MouseEvent;
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod && e.altKey && e.shiftKey) return "window";
    if (mod && e.altKey) return "split";
    if (mod || (evt instanceof MouseEvent && evt.button === 1)) return "tab";
    return false;
  }
}

export type UserEvent = MouseEvent | KeyboardEvent | TouchEvent | PointerEvent;
