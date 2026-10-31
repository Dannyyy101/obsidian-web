import type { App } from "../app/app";
import { Scope } from "./keymap";

/** Entspricht Obsidians `PopoverSuggest`: schwebende Vorschlagsliste mit Tastaturbedienung über `scope`. */
export abstract class PopoverSuggest<T> {
  app: App;
  scope: Scope;
  /** @internal */
  suggestEl: HTMLElement;
  protected values: T[] = [];
  private selected = 0;
  private isOpen = false;

  constructor(app: App, scope?: Scope) {
    this.app = app;
    this.scope = new Scope(scope);
    this.suggestEl = createDiv("suggestion-container");
    // Fokus bleibt im Eingabefeld, sonst schließt dessen Blur-Ereignis die Liste vor dem Klick.
    this.suggestEl.addEventListener("mousedown", (evt) => evt.preventDefault());
    this.scope.register([], "ArrowDown", () => (this.select((this.selected + 1) % (this.values.length || 1)), false));
    this.scope.register([], "ArrowUp", () => (this.select((this.selected - 1 + this.values.length) % (this.values.length || 1)), false));
    this.scope.register([], "Enter", (evt) => (this.choose(this.selected, evt), false));
    this.scope.register([], "Escape", () => (this.close(), false));
  }

  abstract renderSuggestion(value: T, el: HTMLElement): void;
  abstract selectSuggestion(value: T, evt: MouseEvent | KeyboardEvent): void;

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    document.body.appendChild(this.suggestEl);
    this.app.keymap.pushScope(this.scope);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.app.keymap.popScope(this.scope);
    this.suggestEl.detach();
  }

  /** @internal */
  setSuggestions(values: T[]): void {
    this.values = values;
    this.selected = 0;
    this.suggestEl.empty();
    const listEl = this.suggestEl.createDiv("suggestion");
    values.forEach((value, i) => {
      const el = listEl.createDiv({ cls: ["suggestion-item", ...(i === 0 ? ["is-selected"] : [])] });
      this.renderSuggestion(value, el);
      el.addEventListener("mousemove", () => this.select(i));
      el.addEventListener("click", (evt) => this.choose(i, evt));
    });
  }

  private select(i: number) {
    const els = this.suggestEl.querySelectorAll(".suggestion-item");
    els[this.selected]?.removeClass("is-selected");
    this.selected = i;
    els[i]?.addClass("is-selected");
    els[i]?.scrollIntoView({ block: "nearest" });
  }

  private choose(i: number, evt: MouseEvent | KeyboardEvent) {
    const value = this.values[i];
    if (value !== undefined) this.selectSuggestion(value, evt);
  }
}

/** Entspricht Obsidians `AbstractInputSuggest`: Vorschläge zu einem Eingabefeld, z. B. für Dateipfade. */
export abstract class AbstractInputSuggest<T> extends PopoverSuggest<T> {
  /** Höchstzahl angezeigter Vorschläge. */
  limit = 100;
  private onSelectCb: ((value: T, evt: MouseEvent | KeyboardEvent) => unknown) | null = null;
  /** Zählt Anfragen, damit verspätete asynchrone Ergebnisse verworfen werden. */
  private request = 0;

  constructor(
    app: App,
    protected textInputEl: HTMLInputElement | HTMLDivElement,
  ) {
    super(app);
    textInputEl.addEventListener("input", () => void this.onInputChanged());
    textInputEl.addEventListener("focus", () => void this.onInputChanged());
    textInputEl.addEventListener("blur", () => this.close());
  }

  abstract getSuggestions(query: string): T[] | Promise<T[]>;

  setValue(value: string): void {
    if (this.textInputEl instanceof HTMLInputElement) this.textInputEl.value = value;
    else this.textInputEl.textContent = value;
  }

  getValue(): string {
    return this.textInputEl instanceof HTMLInputElement ? this.textInputEl.value : (this.textInputEl.textContent ?? "");
  }

  onSelect(callback: (value: T, evt: MouseEvent | KeyboardEvent) => unknown): this {
    this.onSelectCb = callback;
    return this;
  }

  selectSuggestion(value: T, evt: MouseEvent | KeyboardEvent): void {
    this.onSelectCb?.(value, evt);
  }

  close(): void {
    this.request++;
    super.close();
  }

  private async onInputChanged() {
    const request = ++this.request;
    const values = (await this.getSuggestions(this.getValue())).slice(0, this.limit);
    if (request !== this.request) return;
    if (!values.length) return this.close();
    this.setSuggestions(values);
    this.open();
    const rect = this.textInputEl.getBoundingClientRect();
    this.suggestEl.style.top = `${rect.bottom + 4}px`;
    this.suggestEl.style.left = `${rect.left}px`;
    this.suggestEl.style.width = `${rect.width}px`;
  }
}
