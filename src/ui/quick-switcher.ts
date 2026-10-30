import type { App } from "../app/app";
import type { TFile } from "../core/vault";
import { type FuzzyMatch, fuzzyMatch } from "../shared/fuzzy";
import { dirname } from "../shared/path";
import { Modal } from "./modal";

const MAX_RESULTS = 50;

interface Item {
  file: TFile | null; // null = „Neue Notiz anlegen“
  match: FuzzyMatch | null;
}

/**
 * Schnellwechsler (Strg/Cmd+O) wie in Obsidian: unscharfe Suche über Dateinamen und Pfade, zuletzt
 * geöffnete zuerst. Enter öffnet, Shift+Enter (oder Enter ohne Treffer) legt eine Notiz an.
 */
export class QuickSwitcher extends Modal {
  private inputEl!: HTMLInputElement;
  private listEl!: HTMLElement;
  private items: Item[] = [];
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
      placeholder: "Datei suchen oder anlegen …",
    });
    this.listEl = this.contentEl.createDiv("prompt-results");
    const instructions = this.contentEl.createDiv("prompt-instructions");
    for (const [key, text] of [["↑↓", "navigieren"], ["↵", "öffnen"], ["⌘ ↵", "in neuem Tab"], ["⇧ ↵", "anlegen"], ["esc", "schließen"]]) {
      const el = instructions.createDiv("prompt-instruction");
      el.createSpan({ cls: "prompt-instruction-command", text: key });
      el.createSpan({ text });
    }
    this.inputEl.addEventListener("input", () => this.update());
    this.inputEl.addEventListener("keydown", (evt) => this.onKey(evt));
    this.update();
    this.inputEl.focus();
  }

  private candidates(): TFile[] {
    const recent = this.app.getRecentFiles();
    const rank = new Map(recent.map((p, i) => [p, i]));
    return this.app.vault
      .getFiles()
      .sort((a, b) => (rank.get(a.path) ?? Infinity) - (rank.get(b.path) ?? Infinity) || b.stat.mtime - a.stat.mtime);
  }

  private update() {
    const query = this.inputEl.value.trim();
    const files = this.candidates();
    if (!query) {
      this.items = files.slice(0, MAX_RESULTS).map((file) => ({ file, match: null }));
    } else {
      const scored: Item[] = [];
      for (const file of files) {
        // Treffer im Dateinamen zählen mehr als im Ordnerpfad.
        const name = file.extension === "md" ? file.basename : file.name;
        const byName = fuzzyMatch(query, name);
        const byPath = byName ? null : fuzzyMatch(query, file.path);
        if (byName) scored.push({ file, match: { ...byName, score: byName.score + 10 } });
        else if (byPath) scored.push({ file, match: { score: byPath.score, matches: [] } });
      }
      scored.sort((a, b) => b.match!.score - a.match!.score);
      this.items = scored.slice(0, MAX_RESULTS);
      const exact = this.items.some((i) => i.file?.basename.toLowerCase() === query.toLowerCase());
      if (!exact) this.items.push({ file: null, match: null });
    }
    this.selected = 0;
    this.renderList();
  }

  private renderList() {
    this.listEl.empty();
    this.items.forEach((item, i) => {
      const el = this.listEl.createDiv({ cls: ["suggestion-item", "mod-complex", ...(i === this.selected ? ["is-selected"] : [])] });
      const content = el.createDiv("suggestion-content");
      if (!item.file) {
        content.createDiv({ cls: "suggestion-title", text: `„${this.inputEl.value.trim()}“ anlegen` });
        el.createDiv({ cls: "suggestion-aux", text: "⇧ ↵" });
      } else {
        const title = content.createDiv("suggestion-title");
        const name = item.file.extension === "md" ? item.file.basename : item.file.name;
        highlight(title, name, item.match?.matches ?? []);
        const folder = dirname(item.file.path);
        if (folder !== "/") content.createDiv({ cls: "suggestion-note", text: folder });
      }
      el.addEventListener("mousemove", () => {
        if (this.selected === i) return;
        this.selected = i;
        this.renderList();
      });
      el.addEventListener("click", (evt) => this.choose(item, evt.shiftKey, evt.metaKey || evt.ctrlKey));
    });
    if (!this.items.length) this.listEl.createDiv({ cls: "suggestion-empty", text: "Keine Dateien gefunden." });
    this.listEl.querySelector(".is-selected")?.scrollIntoView({ block: "nearest" });
  }

  private onKey(evt: KeyboardEvent) {
    if (evt.isComposing) return;
    if (evt.key === "ArrowDown" || evt.key === "ArrowUp") {
      evt.preventDefault();
      const n = this.items.length;
      if (!n) return;
      this.selected = (this.selected + (evt.key === "ArrowDown" ? 1 : n - 1)) % n;
      this.renderList();
    } else if (evt.key === "Enter") {
      evt.preventDefault();
      const item = evt.shiftKey ? { file: null, match: null } : this.items[this.selected];
      if (item) this.choose(item, evt.shiftKey, evt.metaKey || evt.ctrlKey);
    }
  }

  private async choose(item: Item, create: boolean, newLeaf = false) {
    const query = this.inputEl.value.trim();
    this.close();
    if (item.file && !create) return this.app.openFileAt(item.file, undefined, undefined, newLeaf);
    if (!query) return;
    await this.app.workspace.openLinkText(query, "", newLeaf);
  }
}

/** Getroffene Zeichen hervorheben (`.suggestion-highlight`). */
function highlight(el: HTMLElement, text: string, matches: number[]) {
  const nfc = text.normalize("NFC");
  const hits = new Set(matches);
  let run = "";
  let inHit = false;
  const flush = () => {
    if (!run) return;
    if (inHit) el.createSpan({ cls: "suggestion-highlight", text: run });
    else el.appendText(run);
    run = "";
  };
  [...nfc].forEach((ch, i) => {
    // Indizes beziehen sich auf UTF-16-Einheiten; für BMP-Zeichen (Umlaute) identisch.
    const hit = hits.has(i);
    if (hit !== inHit) {
      flush();
      inHit = hit;
    }
    run += ch;
  });
  flush();
}
