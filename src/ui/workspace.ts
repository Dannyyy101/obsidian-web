import type { Extension } from "@codemirror/state";
import type { App } from "../app/app";
import { parseLinktext } from "../core/metadata-cache";
import type { TAbstractFile, TFile } from "../core/vault";
import type { MarkdownEditor } from "../editor/markdown-editor";
import { Events } from "../shared/events";
import { setIcon } from "./icons";
import { Notice } from "./notice";
import { type LeafView, WorkspaceLeaf } from "./workspace-leaf";

interface SavedLayout {
  tabs: { path: string | null; reading?: boolean; type?: string }[];
  active: number;
}

const LAYOUT_KEY = "tabs";

/** Wie Obsidians `PaneType`. */
export type PaneType = "tab" | "split" | "window";

/**
 * Entspricht Obsidians `Workspace`: Ribbon, Seitenleisten, Tabs im Hauptbereich, Statusleiste.
 * Das Tab-Layout wird pro Vault im Browser gespeichert – nicht in `workspace.json`, damit das
 * Layout von Obsidian Desktop beim Sync nicht überschrieben wird. Splits folgen später.
 */
export class Workspace extends Events {
  containerEl: HTMLElement;
  ribbonEl: HTMLElement;
  ribbonActionsEl: HTMLElement;
  ribbonSettingsEl: HTMLElement;
  leftSplitEl: HTMLElement;
  rootSplitEl: HTMLElement;
  rightSplitEl: HTMLElement;
  statusBarEl: HTMLElement;
  /** Tab-Leiste: links/rechts Platz für Bedienelemente (Seitenleisten-Umschalter). */
  tabBarLeftEl: HTMLElement;
  tabBarRightEl: HTMLElement;
  layoutReady = false;
  leaves: WorkspaceLeaf[] = [];
  activeLeaf: WorkspaceLeaf | null = null;

  private tabBarEl: HTMLElement;
  private leafContainerEl: HTMLElement;
  private activeFile: TFile | null = null;
  private restoring = false;
  private readyCallbacks: (() => unknown)[] = [];
  /** Editor-Erweiterungen der Plugins; Plugins dürfen die Arrays nachträglich ändern (`updateOptions`). */
  private editorExtensions: Extension[] = [];
  /** Ansichtstyp → Erzeuger (wie Obsidians `viewRegistry`), z. B. „graph“. */
  private viewCreators = new Map<string, (leaf: WorkspaceLeaf) => LeafView>();

  constructor(
    private app: App,
    parent: HTMLElement,
  ) {
    super();
    this.containerEl = parent.createDiv("app-container");
    const workspace = this.containerEl.createDiv("workspace");
    this.ribbonEl = workspace.createDiv("workspace-ribbon side-dock-ribbon mod-left");
    this.ribbonActionsEl = this.ribbonEl.createDiv("side-dock-actions");
    this.ribbonSettingsEl = this.ribbonEl.createDiv("side-dock-settings");
    this.leftSplitEl = workspace.createDiv("workspace-split mod-horizontal mod-sidedock mod-left-split");
    this.rootSplitEl = workspace.createDiv("workspace-split mod-vertical mod-root");
    const tabs = this.rootSplitEl.createDiv("workspace-tabs mod-top");
    const header = tabs.createDiv("workspace-tab-header-container");
    this.tabBarLeftEl = header.createDiv("workspace-tab-header-container-left");
    this.tabBarEl = header.createDiv("workspace-tab-header-container-inner");
    const newTab = header.createDiv({ cls: "clickable-icon workspace-tab-header-new-tab", attr: { "aria-label": "Neuer Tab" } });
    setIcon(newTab, "plus");
    newTab.addEventListener("click", () => this.setActiveLeaf(this.createLeaf()));
    header.createDiv("workspace-tab-header-spacer");
    this.tabBarRightEl = header.createDiv("workspace-tab-header-container-right");
    this.leafContainerEl = tabs.createDiv("workspace-tab-container");
    this.enableTabDragging();

    // Gelöschte Dateien: ihre Tabs schließen (wie Obsidian).
    app.vault.on("delete", (file: TAbstractFile) => {
      for (const leaf of [...this.leaves]) if (leaf.getFile() === file) void this.closeLeaf(leaf);
    });
    this.rightSplitEl = workspace.createDiv("workspace-split mod-horizontal mod-sidedock mod-right-split");
    this.statusBarEl = this.containerEl.createDiv("status-bar");
  }

  onLayoutReady(callback: () => unknown): void {
    if (this.layoutReady) setTimeout(callback, 0);
    else this.readyCallbacks.push(callback);
  }

  /** @internal */
  setLayoutReady(): void {
    this.layoutReady = true;
    for (const cb of this.readyCallbacks.splice(0)) {
      try {
        cb();
      } catch (err) {
        console.error(err);
      }
    }
    this.trigger("layout-ready");
  }

  registerView(type: string, creator: (leaf: WorkspaceLeaf) => LeafView): void {
    this.viewCreators.set(type, creator);
  }

  getLeavesOfType(type: string): WorkspaceLeaf[] {
    return this.leaves.filter((l) => l.view?.getViewType() === type);
  }

  /**
   * Öffnet eine Ansicht als Tab: einen vorhandenen Tab dieses Typs, sonst den aktiven, wenn er leer
   * ist, sonst einen neuen. Eine geöffnete Datei wird dabei nie verdrängt.
   */
  openView(type: string): WorkspaceLeaf | null {
    const creator = this.viewCreators.get(type);
    if (!creator) return null;
    let leaf = this.getLeavesOfType(type)[0];
    if (!leaf) {
      const active = this.activeLeaf;
      leaf = active && !active.view && !active.editor.getFile() ? active : this.getLeaf("tab");
      leaf.setView(creator(leaf));
    }
    this.setActiveLeaf(leaf);
    return leaf;
  }

  getActiveFile(): TFile | null {
    return this.activeFile;
  }

  /** Editor des aktiven Tabs (legt bei Bedarf einen leeren Tab an). */
  get activeEditor(): MarkdownEditor {
    return this.getLeaf(false).editor;
  }

  /** Ansicht des aktiven Tabs, wenn sie vom Typ `type` ist (z. B. `MarkdownView`). */
  getActiveViewOfType<T>(type: abstract new (...args: any[]) => T): T | null {
    const view = this.activeLeaf?.view;
    return view instanceof type ? view : null;
  }

  /** Alle Tabs (Seitenleisten sind in obsidian-web noch keine Leaves). */
  iterateAllLeaves(callback: (leaf: WorkspaceLeaf) => unknown): void {
    for (const leaf of [...this.leaves]) callback(leaf);
  }

  iterateRootLeaves(callback: (leaf: WorkspaceLeaf) => unknown): void {
    this.iterateAllLeaves(callback);
  }

  iterateEditors(fn: (editor: MarkdownEditor) => void): void {
    for (const leaf of this.leaves) fn(leaf.editor);
  }

  /** @internal Für `Plugin.registerEditorExtension`; liefert eine Funktion zum Entfernen. */
  registerEditorExtension(extension: Extension): () => void {
    this.editorExtensions.push(extension);
    this.updateOptions();
    return () => {
      this.editorExtensions.remove(extension);
      this.updateOptions();
    };
  }

  /** @internal */
  getEditorExtensions(): Extension[] {
    // Kopie: CodeMirror soll bei jedem Neukonfigurieren den aktuellen Inhalt sehen.
    return this.editorExtensions.map((e) => (Array.isArray(e) ? [...e] : e));
  }

  /** Wie Obsidian: wendet geänderte Editor-Erweiterungen auf alle offenen Editoren an. */
  updateOptions(): void {
    this.iterateEditors((editor) => editor.reconfigurePluginExtensions());
  }

  private createLeaf(index = this.leaves.length): WorkspaceLeaf {
    const leaf = new WorkspaceLeaf(
      this.app,
      this.tabBarEl,
      this.leafContainerEl,
      (l) => this.setActiveLeaf(l),
      (l) => void this.closeLeaf(l),
      (l, file) => this.onLeafFile(l, file),
    );
    leaf.setActive(false);
    // Neue Tabs rechts neben dem aktiven einfügen, wie Obsidian.
    const before = this.leaves[index];
    if (before) this.tabBarEl.insertBefore(leaf.tabHeaderEl, before.tabHeaderEl);
    this.leaves.splice(index, 0, leaf);
    return leaf;
  }

  /**
   * Wie Obsidians `getLeaf`: `false` = aktiver Tab (ggf. neu), `true`/`"tab"` = neuer Tab rechts
   * neben dem aktiven. Splits und Fenster gibt es noch nicht, `"split"`/`"window"` öffnen einen Tab.
   */
  getLeaf(newLeaf: PaneType | boolean = false): WorkspaceLeaf {
    if (!newLeaf && this.activeLeaf) return this.activeLeaf;
    const index = this.activeLeaf ? this.leaves.indexOf(this.activeLeaf) + 1 : this.leaves.length;
    const leaf = this.createLeaf(index);
    this.setActiveLeaf(leaf);
    return leaf;
  }

  setActiveLeaf(leaf: WorkspaceLeaf, params: boolean | { focus?: boolean } = true): void {
    const focus = typeof params === "boolean" ? params : params.focus !== false;
    const changed = this.activeLeaf !== leaf;
    this.activeLeaf = leaf;
    for (const l of this.leaves) l.setActive(l === leaf);
    leaf.tabHeaderEl.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (focus) leaf.editor.focus();
    if (changed) this.onLeafFile(leaf, leaf.getFile());
  }

  async closeLeaf(leaf: WorkspaceLeaf): Promise<void> {
    const index = this.leaves.indexOf(leaf);
    if (index < 0) return;
    this.leaves.splice(index, 1);
    await leaf.detach();
    if (this.activeLeaf === leaf) {
      this.activeLeaf = null;
      // Wie Obsidian: der Tab links daneben wird aktiv; ist keiner mehr da, ein leerer neuer.
      const next = this.leaves[Math.max(0, index - 1)] ?? this.createLeaf();
      this.setActiveLeaf(next);
    }
    this.saveLayout();
  }

  /** Nächster/vorheriger Tab (zyklisch). */
  cycleLeaf(direction: 1 | -1): void {
    if (!this.activeLeaf || this.leaves.length < 2) return;
    const index = this.leaves.indexOf(this.activeLeaf);
    this.setActiveLeaf(this.leaves[(index + direction + this.leaves.length) % this.leaves.length]);
  }

  private onLeafFile(leaf: WorkspaceLeaf, file: TFile | null) {
    if (leaf === this.activeLeaf) {
      this.activeFile = file;
      this.trigger("file-open", file);
      this.trigger("active-leaf-change", leaf);
    }
    this.saveLayout();
  }

  /** Tabs per Drag & Drop umsortieren. */
  private enableTabDragging() {
    let dragged: WorkspaceLeaf | null = null;
    this.tabBarEl.addEventListener("dragstart", (evt) => {
      const id = (evt.target as HTMLElement).closest<HTMLElement>("[data-leaf]")?.dataset.leaf;
      dragged = this.leaves.find((l) => l.id === id) ?? null;
      evt.dataTransfer?.setData("text/plain", dragged?.getFile()?.path ?? "");
    });
    this.tabBarEl.addEventListener("dragover", (evt) => {
      if (!dragged) return;
      evt.preventDefault();
      const over = (evt.target as HTMLElement).closest<HTMLElement>("[data-leaf]");
      if (!over || over === dragged.tabHeaderEl) return;
      const target = this.leaves.find((l) => l.id === over.dataset.leaf)!;
      const rect = over.getBoundingClientRect();
      const after = evt.clientX > rect.left + rect.width / 2;
      this.leaves.splice(this.leaves.indexOf(dragged), 1);
      this.leaves.splice(this.leaves.indexOf(target) + (after ? 1 : 0), 0, dragged);
      this.tabBarEl.insertBefore(dragged.tabHeaderEl, after ? over.nextSibling : over);
    });
    this.tabBarEl.addEventListener("dragend", () => {
      dragged = null;
      this.saveLayout();
    });
  }

  private saveLayout() {
    if (this.restoring) return;
    const layout: SavedLayout = {
      tabs: this.leaves.map((l) =>
        l.customView
          ? { path: null, type: l.customView.getViewType() }
          : { path: l.getFile()?.path ?? null, reading: l.editor.isReading() || undefined },
      ),
      active: this.activeLeaf ? this.leaves.indexOf(this.activeLeaf) : 0,
    };
    this.app.saveLocalStorage(LAYOUT_KEY, layout);
  }

  /** Stellt die Tabs der letzten Sitzung wieder her (fehlende Dateien entfallen). */
  async restoreLayout(): Promise<void> {
    const layout = this.app.loadLocalStorage(LAYOUT_KEY) as SavedLayout | null;
    this.restoring = true;
    try {
      for (const tab of layout?.tabs ?? []) {
        const creator = tab.type ? this.viewCreators.get(tab.type) : undefined;
        if (creator) {
          const leaf = this.createLeaf();
          leaf.setView(creator(leaf));
          continue;
        }
        const file = tab.path ? this.app.vault.getFileByPath(tab.path) : null;
        if (tab.path && !file) continue;
        const leaf = this.createLeaf();
        if (file) await leaf.openFile(file);
        if (tab.reading) await leaf.editor.toggleReadingView();
      }
    } finally {
      this.restoring = false;
    }
    const active = this.leaves[Math.min(layout?.active ?? 0, this.leaves.length - 1)];
    this.setActiveLeaf(active ?? this.createLeaf());
    this.saveLayout();
  }

  /**
   * Öffnet einen internen Link wie Obsidian. Existiert das Ziel nicht, wird eine neue Notiz im
   * Vault-Stamm angelegt (Obsidians Standard für „Neue Notizen ablegen“). `newLeaf` öffnet in
   * einem neuen Tab (Cmd/Strg+Klick).
   */
  async openLinkText(linktext: string, sourcePath: string, newLeaf: PaneType | boolean = false): Promise<void> {
    const { path, subpath } = parseLinktext(linktext);
    const { vault, metadataCache } = this.app;
    let file = metadataCache.getFirstLinkpathDest(path, sourcePath);
    if (!file) {
      if (!path.trim()) return;
      const ext = /\.([^/.]+)$/.exec(path)?.[1];
      if (ext && ext.toLowerCase() !== "md") {
        new Notice(`„${path}“ wurde nicht gefunden.`);
        return;
      }
      const name = ext ? path : `${path}.md`;
      try {
        file = await vault.create(name, "");
      } catch (err) {
        new Notice(`„${name}“ konnte nicht angelegt werden: ${err instanceof Error ? err.message : err}`);
        return;
      }
    }
    if (file.extension !== "md") {
      new Notice(`Dateityp „.${file.extension}“ kann noch nicht geöffnet werden.`);
      return;
    }
    const { editor } = this.getLeaf(newLeaf);
    await editor.openFile(file);
    if (subpath) editor.scrollToSubpath(subpath);
  }

  addRibbonIcon(icon: string, title: string, callback: (evt: MouseEvent) => unknown, settings = false) {
    const el = (settings ? this.ribbonSettingsEl : this.ribbonActionsEl).createDiv({
      cls: "clickable-icon side-dock-ribbon-action",
      attr: { "aria-label": title, "data-tooltip-position": "right" },
    });
    setIcon(el, icon);
    el.addEventListener("click", callback);
    return el;
  }

  addStatusBarItem(): HTMLElement {
    return this.statusBarEl.createDiv("status-bar-item");
  }
}
