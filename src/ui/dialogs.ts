import type { App } from "../app/app";
import { Modal } from "./modal";
import { Setting } from "./setting";

class PromptModal extends Modal {
  private value: string;
  private resolve!: (value: string | null) => void;
  private submitted = false;
  result: Promise<string | null>;

  constructor(app: App, title: string, initial: string, private submitLabel: string) {
    super(app);
    this.value = initial;
    this.setTitle(title);
    this.result = new Promise((resolve) => (this.resolve = resolve));
  }

  onOpen() {
    const input = this.contentEl.createEl("input", { type: "text", cls: "prompt-input", value: this.value });
    input.addEventListener("input", () => (this.value = input.value));
    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" && !evt.isComposing) this.submit();
    });
    new Setting(this.contentEl.createDiv("modal-button-container")).addButton((b) =>
      b.setButtonText(this.submitLabel).setCta().onClick(() => this.submit()),
    );
    input.focus();
    input.select();
  }

  private submit() {
    this.submitted = true;
    this.close();
  }

  onClose() {
    this.resolve(this.submitted && this.value.trim() ? this.value.trim() : null);
  }
}

export function promptText(app: App, title: string, initial = "", submitLabel = "OK"): Promise<string | null> {
  const modal = new PromptModal(app, title, initial, submitLabel);
  modal.open();
  return modal.result;
}

export function confirmDialog(app: App, title: string, message: string, confirmLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    let confirmed = false;
    const modal = new Modal(app);
    modal.setTitle(title);
    modal.contentEl.createEl("p", { text: message });
    new Setting(modal.contentEl.createDiv("modal-button-container"))
      .addButton((b) => b.setButtonText("Abbrechen").onClick(() => modal.close()))
      .addButton((b) =>
        b.setButtonText(confirmLabel).setWarning().onClick(() => {
          confirmed = true;
          modal.close();
        }),
      );
    modal.onClose = () => resolve(confirmed);
    modal.open();
  });
}
