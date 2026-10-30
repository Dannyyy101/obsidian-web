import type { App } from "../app/app";
import { TAbstractFile, TFile, TFolder } from "../core/vault";
import { dirname, join } from "../shared/path";
import { confirmDialog, promptText } from "./dialogs";
import { setIcon } from "./icons";
import { Menu } from "./menu";
import { Notice } from "./notice";

/**
 * Datei-Explorer in der linken Sidebar. Wird in Phase 4 zum Core-Plugin `file-explorer` mit eigener
 * View; bis dahin hängt er fest im Layout.
 */
export class FileExplorer {
  containerEl: HTMLElement;
  private treeEl: HTMLElement;
  private renderQueued = false;
  private storageKey: string;

  constructor(private app: App, parent: HTMLElement) {
    this.storageKey = `obsidian-web:${app.vault.getName()}:explorer-expanded`;
    this.containerEl = parent.createDiv("workspace-leaf-content file-explorer-view");
    const nav = this.containerEl.createDiv("nav-header").createDiv("nav-buttons-container");
    this.navButton(nav, "square-pen", "Neue Notiz", () => this.createNote(app.vault.getRoot()));
    this.navButton(nav, "folder-plus", "Neuer Ordner", () => this.createFolder(app.vault.getRoot()));
    this.navButton(nav, "chevrons-down-up", "Alle einklappen", () => this.collapseAll());
    this.treeEl = this.containerEl.createDiv("nav-files-container");
    this.treeEl.addEventListener("contextmenu", (evt) => {
      if (evt.target === this.treeEl) this.showMenu(evt, app.vault.getRoot());
    });

    this.loadExpanded();
    for (const name of ["create", "delete", "rename"]) app.vault.on(name, () => this.queueRender());
    app.workspace.on("file-open", () => this.queueRender());
    this.render();
  }

  private navButton(parent: HTMLElement, icon: string, label: string, onClick: () => unknown) {
    const el = parent.createDiv({ cls: "clickable-icon nav-action-button", attr: { "aria-label": label } });
    setIcon(el, icon);
    el.addEventListener("click", onClick);
  }

  // Gespeichert werden die *aufgeklappten* Ordner; alles andere ist eingeklappt.
  private expanded = new Set<string>();

  private loadExpanded() {
    try {
      this.expanded = new Set(JSON.parse(localStorage.getItem(this.storageKey) ?? "[]"));
    } catch {
      this.expanded = new Set();
    }
  }

  private saveExpanded() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify([...this.expanded]));
    } catch {
      // Ohne localStorage geht nur der Zustand über Neuladen hinweg verloren.
    }
  }

  private collapseAll() {
    this.expanded.clear();
    this.saveExpanded();
    this.render();
  }

  private queueRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.render();
    });
  }

  private render() {
    const scroll = this.treeEl.scrollTop;
    this.treeEl.empty();
    this.renderChildren(this.treeEl, this.app.vault.getRoot());
    this.treeEl.scrollTop = scroll;
  }

  private sorted(folder: TFolder): TAbstractFile[] {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    return [...folder.children].sort((a, b) => {
      if (a instanceof TFolder !== b instanceof TFolder) return a instanceof TFolder ? -1 : 1;
      return collator.compare(a.name, b.name);
    });
  }

  private renderChildren(parent: HTMLElement, folder: TFolder) {
    for (const child of this.sorted(folder)) {
      if (child instanceof TFolder) this.renderFolder(parent, child);
      else if (child instanceof TFile) this.renderFile(parent, child);
    }
  }

  private renderFolder(parent: HTMLElement, folder: TFolder) {
    const isOpen = this.expanded.has(folder.path);
    const el = parent.createDiv({ cls: ["tree-item", "nav-folder", ...(isOpen ? [] : ["is-collapsed"])] });
    const self = el.createDiv({ cls: "tree-item-self nav-folder-title is-clickable", attr: { "data-path": folder.path } });
    const icon = self.createDiv("tree-item-icon collapse-icon");
    setIcon(icon, "chevron-down");
    self.createDiv({ cls: "tree-item-inner nav-folder-title-content", text: folder.name });
    self.addEventListener("click", () => {
      if (isOpen) this.expanded.delete(folder.path);
      else this.expanded.add(folder.path);
      this.saveExpanded();
      this.render();
    });
    self.addEventListener("contextmenu", (evt) => this.showMenu(evt, folder));
    if (isOpen) this.renderChildren(el.createDiv("tree-item-children nav-folder-children"), folder);
  }

  private renderFile(parent: HTMLElement, file: TFile) {
    const active = this.app.workspace.getActiveFile() === file;
    const el = parent.createDiv("tree-item nav-file");
    const self = el.createDiv({
      cls: ["tree-item-self", "nav-file-title", "is-clickable", ...(active ? ["is-active"] : [])],
      attr: { "data-path": file.path },
    });
    self.createDiv({
      cls: "tree-item-inner nav-file-title-content",
      text: file.extension === "md" ? file.basename : file.name,
    });
    if (file.extension !== "md") self.createDiv({ cls: "nav-file-tag", text: file.extension });
    self.addEventListener("click", (evt) => this.open(file, evt.metaKey || evt.ctrlKey));
    self.addEventListener("auxclick", (evt) => evt.button === 1 && this.open(file, true));
    self.addEventListener("contextmenu", (evt) => this.showMenu(evt, file));
  }

  /** Öffnen im aktiven Tab; mit Cmd/Strg oder Mittelklick in einem neuen. */
  private open(file: TFile, newLeaf = false) {
    void this.app.openFileAt(file, undefined, undefined, newLeaf);
  }

  private reveal(path: string) {
    let dir = dirname(path);
    while (dir !== "/") {
      this.expanded.add(dir);
      dir = dirname(dir);
    }
    this.saveExpanded();
  }

  private showMenu(evt: MouseEvent, file: TAbstractFile) {
    evt.preventDefault();
    const menu = new Menu();
    const folder = file instanceof TFolder ? file : file.parent ?? this.app.vault.getRoot();
    if (file instanceof TFile) {
      menu.addItem((i) => i.setTitle("In neuem Tab öffnen").setIcon("file-plus").onClick(() => this.open(file, true)));
      menu.addSeparator();
    }
    menu.addItem((i) => i.setTitle("Neue Notiz").setIcon("square-pen").onClick(() => this.createNote(folder)));
    menu.addItem((i) => i.setTitle("Neuer Ordner").setIcon("folder-plus").onClick(() => this.createFolder(folder)));
    if (!(file instanceof TFolder && file.isRoot())) {
      menu.addSeparator();
      menu.addItem((i) => i.setTitle("Umbenennen …").setIcon("pencil").onClick(() => this.rename(file)));
      menu.addItem((i) => i.setTitle("Löschen").setIcon("trash-2").setWarning(true).onClick(() => this.delete(file)));
    }
    this.app.workspace.trigger("file-menu", menu, file, "file-explorer-context-menu", null);
    menu.showAtMouseEvent(evt);
  }

  private async createNote(folder: TFolder) {
    const file = await this.app.createNewNote(folder);
    this.reveal(file.path);
  }

  private async createFolder(parent: TFolder) {
    const name = await promptText(this.app, "Neuer Ordner", "", "Anlegen");
    if (!name) return;
    const path = join(parent.path, name);
    if (this.app.vault.getAbstractFileByPath(path)) return new Notice("Es gibt bereits einen Eintrag mit diesem Namen.");
    await this.app.vault.createFolder(path);
    this.expanded.add(path);
    this.reveal(path);
    this.render();
  }

  private async rename(file: TAbstractFile) {
    const isNote = file instanceof TFile && file.extension === "md";
    const current = isNote ? (file as TFile).basename : file.name;
    const name = await promptText(this.app, "Umbenennen", current, "Umbenennen");
    if (!name || name === current) return;
    if (/[\\/:]/.test(name)) return new Notice("Dateinamen dürfen keine der Zeichen \\ / : enthalten.");
    const oldPath = file.path;
    const newPath = join(file.parent?.path ?? "/", isNote ? `${name}.md` : name);
    try {
      await this.app.fileManager.renameFile(file, newPath);
      // Aufgeklappte Unterordner mitnehmen.
      for (const p of [...this.expanded]) {
        if (p !== oldPath && !p.startsWith(`${oldPath}/`)) continue;
        this.expanded.delete(p);
        this.expanded.add(newPath + p.slice(oldPath.length));
      }
      this.saveExpanded();
    } catch (err) {
      new Notice(`Umbenennen fehlgeschlagen: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async delete(file: TAbstractFile) {
    const what = file instanceof TFolder ? `den Ordner „${file.name}“ samt Inhalt` : `„${file.name}“`;
    if (!(await confirmDialog(this.app, "Löschen", `Möchtest du ${what} in den Papierkorb (.trash) verschieben?`, "Löschen"))) return;
    await this.app.vault.trash(file, true);
  }
}
