import type { App } from "../app/app";
import type { Command } from "../core/commands";
import { Modal } from "./modal";

/** Befehlspalette (Strg/Cmd+P). Filter: Alle eingegebenen Wörter müssen im Namen vorkommen. */
export class CommandPalette extends Modal {
  private inputEl!: HTMLInputElement;
  private listEl!: HTMLElement;
  private matches: Command[] = [];
  private selected = 0;

  constructor(app: App) {
    super(app);
    this.modalEl.addClass("prompt");
    this.titleEl.detach();
  }

  onOpen() {
    this.contentEl.empty();
    this.inputEl = this.contentEl.createEl("input", {
      type: "text",
      cls: "prompt-input",
      placeholder: "Befehl auswählen …",
    });
    this.listEl = this.contentEl.createDiv("prompt-results");
    this.inputEl.addEventListener("input", () => this.update());
    this.inputEl.addEventListener("keydown", (evt) => this.onKey(evt));
    this.update();
    this.inputEl.focus();
  }

  private update() {
    const words = this.inputEl.value.toLowerCase().split(/\s+/).filter(Boolean);
    this.matches = this.app.commands
      .listCommands()
      .filter((c) => words.every((w) => c.name.toLowerCase().includes(w)));
    this.selected = 0;
    this.renderList();
  }

  private renderList() {
    this.listEl.empty();
    this.matches.forEach((command, i) => {
      const el = this.listEl.createDiv({
        cls: ["suggestion-item", ...(i === this.selected ? ["is-selected"] : [])],
        text: command.name,
      });
      el.addEventListener("mousemove", () => {
        if (this.selected === i) return;
        this.selected = i;
        this.renderList();
      });
      el.addEventListener("click", () => this.run(command));
    });
    if (!this.matches.length) this.listEl.createDiv({ cls: "suggestion-empty", text: "Keine Befehle gefunden." });
    this.listEl.querySelector(".is-selected")?.scrollIntoView({ block: "nearest" });
  }

  private onKey(evt: KeyboardEvent) {
    if (evt.key === "ArrowDown" || evt.key === "ArrowUp") {
      evt.preventDefault();
      const n = this.matches.length;
      if (!n) return;
      this.selected = (this.selected + (evt.key === "ArrowDown" ? 1 : n - 1)) % n;
      this.renderList();
    } else if (evt.key === "Enter" && !evt.isComposing) {
      evt.preventDefault();
      const command = this.matches[this.selected];
      if (command) this.run(command);
    }
  }

  private run(command: Command) {
    this.close();
    this.app.commands.executeCommandById(command.id);
  }
}
