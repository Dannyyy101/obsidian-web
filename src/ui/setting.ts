import { setIcon } from "./icons";

// Entspricht Obsidians `Setting` und den Control-Komponenten (TextComponent, DropdownComponent …).

export abstract class BaseComponent {
  disabled = false;

  then(cb: (component: this) => unknown): this {
    cb(this);
    return this;
  }

  setDisabled(disabled: boolean): this {
    this.disabled = disabled;
    return this;
  }
}

export abstract class ValueComponent<T> extends BaseComponent {
  registerOptionListener(listeners: Record<string, (value?: T) => T>, key: string): this {
    listeners[key] = (value?: T) => {
      if (value !== undefined) this.setValue(value);
      return this.getValue();
    };
    return this;
  }

  abstract getValue(): T;
  abstract setValue(value: T): this;
}

export class AbstractTextComponent<E extends HTMLInputElement | HTMLTextAreaElement> extends ValueComponent<string> {
  inputEl: E;
  private changeCallback: ((value: string) => unknown) | null = null;

  constructor(inputEl: E) {
    super();
    this.inputEl = inputEl;
    inputEl.addEventListener("input", () => this.onChanged());
  }

  override setDisabled(disabled: boolean): this {
    super.setDisabled(disabled);
    this.inputEl.disabled = disabled;
    return this;
  }

  getValue(): string {
    return this.inputEl.value;
  }

  setValue(value: string): this {
    this.inputEl.value = value;
    return this;
  }

  setPlaceholder(placeholder: string): this {
    this.inputEl.placeholder = placeholder;
    return this;
  }

  onChanged(): void {
    this.changeCallback?.(this.getValue());
  }

  onChange(callback: (value: string) => unknown): this {
    this.changeCallback = callback;
    return this;
  }
}

export class TextComponent extends AbstractTextComponent<HTMLInputElement> {
  constructor(containerEl: HTMLElement) {
    super(containerEl.createEl("input", { type: "text", attr: { spellcheck: "false" } }));
  }
}

export class SearchComponent extends AbstractTextComponent<HTMLInputElement> {
  constructor(containerEl: HTMLElement) {
    super(containerEl.createDiv("search-input-container").createEl("input", { type: "search" }));
  }
}

export class TextAreaComponent extends AbstractTextComponent<HTMLTextAreaElement> {
  constructor(containerEl: HTMLElement) {
    super(containerEl.createEl("textarea"));
  }
}

export class DropdownComponent extends ValueComponent<string> {
  selectEl: HTMLSelectElement;
  private changeCallback: ((value: string) => unknown) | null = null;

  constructor(containerEl: HTMLElement) {
    super();
    this.selectEl = containerEl.createEl("select", "dropdown");
    this.selectEl.addEventListener("change", () => this.changeCallback?.(this.getValue()));
  }

  override setDisabled(disabled: boolean): this {
    super.setDisabled(disabled);
    this.selectEl.disabled = disabled;
    return this;
  }

  addOption(value: string, display: string): this {
    this.selectEl.createEl("option", { value, text: display });
    return this;
  }

  addOptions(options: Record<string, string>): this {
    for (const [value, display] of Object.entries(options)) this.addOption(value, display);
    return this;
  }

  getValue(): string {
    return this.selectEl.value;
  }

  setValue(value: string): this {
    this.selectEl.value = value;
    return this;
  }

  onChange(callback: (value: string) => unknown): this {
    this.changeCallback = callback;
    return this;
  }
}

export class ToggleComponent extends ValueComponent<boolean> {
  toggleEl: HTMLElement;
  private value = false;
  private changeCallback: ((value: boolean) => unknown) | null = null;

  constructor(containerEl: HTMLElement) {
    super();
    this.toggleEl = containerEl.createDiv("checkbox-container");
    this.toggleEl.createEl("input", { type: "checkbox", attr: { tabindex: 0 } });
    this.toggleEl.addEventListener("click", () => {
      if (this.disabled) return;
      this.setValue(!this.value);
      this.changeCallback?.(this.value);
    });
  }

  override setDisabled(disabled: boolean): this {
    super.setDisabled(disabled);
    this.toggleEl.toggleClass("is-disabled", disabled);
    return this;
  }

  getValue(): boolean {
    return this.value;
  }

  setValue(on: boolean): this {
    this.value = on;
    this.toggleEl.toggleClass("is-enabled", on);
    return this;
  }

  setTooltip(tooltip: string): this {
    this.toggleEl.setAttr("aria-label", tooltip);
    return this;
  }

  onClick(): void {
    this.toggleEl.click();
  }

  onChange(callback: (value: boolean) => unknown): this {
    this.changeCallback = callback;
    return this;
  }
}

export class SliderComponent extends ValueComponent<number> {
  sliderEl: HTMLInputElement;
  private changeCallback: ((value: number) => unknown) | null = null;

  constructor(containerEl: HTMLElement) {
    super();
    this.sliderEl = containerEl.createEl("input", { type: "range", cls: "slider" });
    this.sliderEl.addEventListener("input", () => this.changeCallback?.(this.getValue()));
  }

  setLimits(min: number | null, max: number | null, step: number | "any"): this {
    if (min !== null) this.sliderEl.min = String(min);
    if (max !== null) this.sliderEl.max = String(max);
    this.sliderEl.step = String(step);
    return this;
  }

  setDynamicTooltip(): this {
    return this;
  }

  setInstant(_instant: boolean): this {
    return this;
  }

  getValue(): number {
    return Number(this.sliderEl.value);
  }

  setValue(value: number): this {
    this.sliderEl.value = String(value);
    return this;
  }

  onChange(callback: (value: number) => unknown): this {
    this.changeCallback = callback;
    return this;
  }
}

export class ButtonComponent extends BaseComponent {
  buttonEl: HTMLButtonElement;
  private clickCallback: ((evt: MouseEvent) => unknown) | null = null;

  constructor(containerEl: HTMLElement) {
    super();
    this.buttonEl = containerEl.createEl("button");
    this.buttonEl.addEventListener("click", (evt) => this.clickCallback?.(evt));
  }

  override setDisabled(disabled: boolean): this {
    super.setDisabled(disabled);
    this.buttonEl.disabled = disabled;
    return this;
  }

  setCta(): this {
    this.buttonEl.addClass("mod-cta");
    return this;
  }

  removeCta(): this {
    this.buttonEl.removeClass("mod-cta");
    return this;
  }

  setWarning(): this {
    this.buttonEl.addClass("mod-warning");
    return this;
  }

  setTooltip(tooltip: string): this {
    this.buttonEl.setAttr("aria-label", tooltip);
    return this;
  }

  setButtonText(name: string): this {
    this.buttonEl.setText(name);
    return this;
  }

  setIcon(icon: string): this {
    setIcon(this.buttonEl, icon);
    return this;
  }

  setClass(cls: string): this {
    this.buttonEl.addClass(cls);
    return this;
  }

  onClick(callback: (evt: MouseEvent) => unknown): this {
    this.clickCallback = callback;
    return this;
  }
}

export class ExtraButtonComponent extends BaseComponent {
  extraSettingsEl: HTMLElement;
  private clickCallback: (() => unknown) | null = null;

  constructor(containerEl: HTMLElement) {
    super();
    this.extraSettingsEl = containerEl.createDiv("clickable-icon extra-setting-button");
    this.extraSettingsEl.addEventListener("click", () => {
      if (!this.disabled) this.clickCallback?.();
    });
  }

  setTooltip(tooltip: string): this {
    this.extraSettingsEl.setAttr("aria-label", tooltip);
    return this;
  }

  setIcon(icon: string): this {
    setIcon(this.extraSettingsEl, icon);
    return this;
  }

  onClick(callback: () => unknown): this {
    this.clickCallback = callback;
    return this;
  }
}

export class Setting {
  settingEl: HTMLElement;
  infoEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;
  components: BaseComponent[] = [];

  constructor(containerEl: HTMLElement) {
    this.settingEl = containerEl.createDiv("setting-item");
    this.infoEl = this.settingEl.createDiv("setting-item-info");
    this.nameEl = this.infoEl.createDiv("setting-item-name");
    this.descEl = this.infoEl.createDiv("setting-item-description");
    this.controlEl = this.settingEl.createDiv("setting-item-control");
  }

  setName(name: string | DocumentFragment): this {
    this.nameEl.setText(name);
    return this;
  }

  setDesc(desc: string | DocumentFragment): this {
    this.descEl.setText(desc);
    return this;
  }

  setClass(cls: string): this {
    this.settingEl.addClass(cls);
    return this;
  }

  setTooltip(tooltip: string): this {
    this.nameEl.setAttr("aria-label", tooltip);
    return this;
  }

  setHeading(): this {
    this.settingEl.addClass("setting-item-heading");
    return this;
  }

  setDisabled(disabled: boolean): this {
    this.settingEl.toggleClass("is-disabled", disabled);
    for (const c of this.components) c.setDisabled(disabled);
    return this;
  }

  private add<T extends BaseComponent>(component: T, cb: (component: T) => unknown): this {
    this.components.push(component);
    cb(component);
    return this;
  }

  addButton(cb: (component: ButtonComponent) => unknown): this {
    return this.add(new ButtonComponent(this.controlEl), cb);
  }

  addExtraButton(cb: (component: ExtraButtonComponent) => unknown): this {
    return this.add(new ExtraButtonComponent(this.controlEl), cb);
  }

  addToggle(cb: (component: ToggleComponent) => unknown): this {
    return this.add(new ToggleComponent(this.controlEl), cb);
  }

  addText(cb: (component: TextComponent) => unknown): this {
    return this.add(new TextComponent(this.controlEl), cb);
  }

  addSearch(cb: (component: SearchComponent) => unknown): this {
    return this.add(new SearchComponent(this.controlEl), cb);
  }

  addTextArea(cb: (component: TextAreaComponent) => unknown): this {
    return this.add(new TextAreaComponent(this.controlEl), cb);
  }

  addDropdown(cb: (component: DropdownComponent) => unknown): this {
    return this.add(new DropdownComponent(this.controlEl), cb);
  }

  addSlider(cb: (component: SliderComponent) => unknown): this {
    return this.add(new SliderComponent(this.controlEl), cb);
  }

  then(cb: (setting: this) => unknown): this {
    cb(this);
    return this;
  }

  clear(): this {
    this.controlEl.empty();
    this.components = [];
    return this;
  }
}
