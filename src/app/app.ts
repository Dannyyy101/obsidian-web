import type { ObsidianProtocolHandler } from "../api/plugin";
import { PluginManager } from "../api/plugin-manager";
import { Commands } from "../core/commands";
import { FileManager } from "../core/file-manager";
import { MetadataCache, type MetadataParser, type MetadataStore } from "../core/metadata-cache";
import type { TFile, Vault } from "../core/vault";
import { join } from "../shared/path";
import type { EditorView } from "@codemirror/view";
import { openDocumentSearch } from "../editor/document-search";
import { foldAll, toggleFold, unfoldAll } from "../editor/folding";
import { FORMATTING_COMMANDS } from "../editor/formatting";
import { MarkdownEditor } from "../editor/markdown-editor";
import { CommandPalette } from "../ui/command-palette";
import { promptText } from "../ui/dialogs";
import { QuickSwitcher } from "../ui/quick-switcher";
import { setIcon } from "../ui/icons";
import { Sidebar } from "../ui/sidebar";
import { BacklinksView } from "../ui/views/backlinks-view";
import { GRAPH_VIEW_TYPE, GraphView, LocalGraphView } from "../ui/views/graph-view";
import { OutgoingLinksView } from "../ui/views/outgoing-links-view";
import { OutlineView } from "../ui/views/outline-view";
import { SearchView } from "../ui/views/search-view";
import { FileExplorer } from "../ui/file-explorer";
import { Keymap } from "../ui/keymap";
import { Notice } from "../ui/notice";
import { SettingsModal } from "../ui/settings-modal";
import { coreSettingTabs } from "./core-settings";
import { Workspace } from "../ui/workspace";

/** Entspricht Obsidians `App`: hält alle Teile zusammen und ist für Plugins `this.app`. */
export class App {
  vault: Vault;
  workspace: Workspace;
  commands = new Commands();
  keymap = new Keymap();
  /** Wie Obsidians `app.dom`: wichtige Container der Oberfläche. */
  dom: { appContainerEl: HTMLElement };
  fileManager: FileManager;
  metadataCache: MetadataCache;
  setting: SettingsModal;
  plugins: PluginManager;
  fileExplorer: FileExplorer;
  leftSidebar: Sidebar;
  rightSidebar: Sidebar;
  searchView: SearchView;
  protocolHandlers = new Map<string, ObsidianProtocolHandler>();
  appId: string;

  constructor(
    vault: Vault,
    containerEl: HTMLElement,
    options: { metadataParser?: MetadataParser; metadataStore?: MetadataStore } = {},
  ) {
    this.vault = vault;
    this.appId = vault.getName();
    this.metadataCache = new MetadataCache(vault, options.metadataParser, options.metadataStore);
    this.fileManager = new FileManager(vault, this.metadataCache);
    this.workspace = new Workspace(this, containerEl);
    this.dom = { appContainerEl: this.workspace.containerEl };
    this.setting = new SettingsModal(this);
    for (const tab of coreSettingTabs(this)) this.setting.addCoreSettingTab(tab);
    this.plugins = new PluginManager(this);

    // Seitenleisten wie in Obsidian: links Dateien und Suche, rechts Backlinks, Links, Gliederung.
    const key = (side: string) => `obsidian-web:${vault.getName()}:sidebar-${side}`;
    this.leftSidebar = new Sidebar(this.workspace.leftSplitEl, key("left"));
    this.rightSidebar = new Sidebar(this.workspace.rightSplitEl, key("right"));
    const explorerEl = createDiv();
    this.fileExplorer = new FileExplorer(this, explorerEl);
    this.leftSidebar.addView({ id: "file-explorer", icon: "folder-closed", title: "Dateien", containerEl: explorerEl });
    this.searchView = new SearchView(this);
    this.addIndexView(this.leftSidebar, this.searchView);
    this.addIndexView(this.rightSidebar, new BacklinksView(this));
    this.addIndexView(this.rightSidebar, new OutgoingLinksView(this));
    this.addIndexView(this.rightSidebar, new OutlineView(this));
    this.addIndexView(this.rightSidebar, new LocalGraphView(this));
    this.workspace.registerView(GRAPH_VIEW_TYPE, () => new GraphView(this));
    this.addSidebarToggle(this.workspace.tabBarLeftEl, this.leftSidebar, "panel-left", "Linke Seitenleiste");
    this.addSidebarToggle(this.workspace.tabBarRightEl, this.rightSidebar, "panel-right", "Rechte Seitenleiste");
    // Ungespeicherte Änderungen aller Tabs schreiben, bevor Links in Dateien angepasst werden.
    this.fileManager.beforeRename = async () => {
      const editors: MarkdownEditor[] = [];
      this.workspace.iterateEditors((e) => editors.push(e));
      await Promise.all(editors.map((e) => e.save()));
    };

    this.workspace.addRibbonIcon("git-fork", "Graph-Ansicht öffnen", () => this.workspace.openView(GRAPH_VIEW_TYPE));
    this.workspace.addRibbonIcon("settings", "Einstellungen", () => this.setting.open(), true);
    this.registerCoreCommands();
    this.workspace.on("file-open", (file) => file && this.trackRecentFile(file.path));
    vault.on("rename", (file, oldPath: string) => {
      this.saveLocalStorage(App.RECENT_KEY, this.getRecentFiles().map((p) => (p === oldPath ? file.path : p)));
    });
    document.addEventListener("keydown", (evt) => this.onGlobalKey(evt));
  }

  /** Editor des aktiven Tabs. */
  get editor(): MarkdownEditor {
    return this.workspace.activeEditor;
  }

  /** Neue Notiz „Unbenannt“ (fortlaufend nummeriert) im Ordner anlegen und öffnen. */
  async createNewNote(folder = this.vault.getRoot(), newLeaf = false): Promise<TFile> {
    let path = "";
    for (let i = 0; ; i++) {
      path = join(folder.path, `Unbenannt${i ? ` ${i}` : ""}.md`);
      if (!this.vault.getAbstractFileByPath(path)) break;
    }
    const file = await this.vault.create(path, "");
    await this.workspace.getLeaf(newLeaf).openFile(file);
    return file;
  }

  private addIndexView(sidebar: Sidebar, view: SearchView | BacklinksView | OutgoingLinksView | OutlineView | LocalGraphView) {
    view.isVisible = () => sidebar.isActive(view.id);
    sidebar.addView(view);
  }

  private addSidebarToggle(parent: HTMLElement, sidebar: Sidebar, icon: string, label: string) {
    const button = parent.createDiv({ cls: "clickable-icon sidebar-toggle-button", attr: { "aria-label": `${label} ein-/ausblenden` } });
    setIcon(button, icon);
    button.addEventListener("click", () => sidebar.toggle());
  }

  /**
   * Datei öffnen und optional einen Bereich auswählen (Suche, Backlinks, Gliederung).
   * `newLeaf` öffnet in einem neuen Tab.
   */
  async openFileAt(file: TFile, from?: number, to?: number, newLeaf = false): Promise<void> {
    if (file.extension !== "md") {
      new Notice(`Dateityp „.${file.extension}“ kann noch nicht geöffnet werden.`);
      return;
    }
    const { editor } = this.workspace.getLeaf(newLeaf);
    await editor.openFile(file);
    if (from !== undefined) await editor.scrollToRange(from, to);
  }

  private registerCoreCommands() {
    // Browser reservieren Cmd/Strg+T, +W und Strg+Tab für ihre eigenen Tabs → zusätzlich Alt.
    this.commands.addCommand({ id: "workspace:new-tab", name: "Neuer Tab", callback: () => this.workspace.getLeaf("tab") });
    this.commands.addCommand({
      id: "workspace:close",
      name: "Aktuellen Tab schließen",
      callback: () => this.workspace.activeLeaf && void this.workspace.closeLeaf(this.workspace.activeLeaf),
    });
    this.commands.addCommand({ id: "workspace:next-tab", name: "Zum nächsten Tab", callback: () => this.workspace.cycleLeaf(1) });
    this.commands.addCommand({ id: "workspace:previous-tab", name: "Zum vorherigen Tab", callback: () => this.workspace.cycleLeaf(-1) });
    this.commands.addCommand({ id: "file-explorer:new-file", name: "Neue Notiz anlegen", callback: () => void this.createNewNote() });
    this.commands.addCommand({ id: "file-explorer:new-file-in-new-pane", name: "Neue Notiz in neuem Tab", callback: () => void this.createNewNote(undefined, true) });
    this.commands.addCommand({ id: "app:toggle-left-sidebar", name: "Linke Seitenleiste ein-/ausblenden", callback: () => this.leftSidebar.toggle() });
    this.commands.addCommand({ id: "app:toggle-right-sidebar", name: "Rechte Seitenleiste ein-/ausblenden", callback: () => this.rightSidebar.toggle() });
    this.commands.addCommand({
      id: "global-search:open",
      name: "Suche: In allen Dateien suchen",
      callback: () => {
        this.leftSidebar.activate("search");
        this.searchView.focus();
      },
    });
    this.commands.addCommand({ id: "file-explorer:open", name: "Dateien anzeigen", callback: () => this.leftSidebar.activate("file-explorer") });
    this.commands.addCommand({ id: "backlink:open", name: "Backlinks anzeigen", callback: () => this.rightSidebar.activate("backlink") });
    this.commands.addCommand({ id: "outgoing-links:open", name: "Ausgehende Links anzeigen", callback: () => this.rightSidebar.activate("outgoing-link") });
    this.commands.addCommand({ id: "outline:open", name: "Gliederung anzeigen", callback: () => this.rightSidebar.activate("outline") });
    this.commands.addCommand({ id: "graph:open", name: "Graph-Ansicht öffnen", callback: () => this.workspace.openView(GRAPH_VIEW_TYPE) });
    this.commands.addCommand({ id: "graph:open-local", name: "Lokalen Graphen öffnen", callback: () => this.rightSidebar.activate("localgraph") });
    this.commands.addCommand({
      id: "command-palette:open",
      name: "Befehlspalette: Öffnen",
      callback: () => new CommandPalette(this).open(),
    });
    this.commands.addCommand({
      id: "editor:toggle-source",
      name: "Quellmodus umschalten (Live Preview ↔ Quelltext)",
      checkCallback: (checking) => {
        if (!this.editor.getFile()) return false;
        if (!checking) void this.editor.toggleSourceMode();
        return true;
      },
    });
    this.commands.addCommand({
      id: "markdown:toggle-preview",
      name: "Lesemodus umschalten",
      checkCallback: (checking) => {
        if (!this.editor.getFile()) return false;
        if (!checking) void this.editor.toggleReadingView();
        return true;
      },
    });
    const foldCommand = (id: string, name: string, run: (view: EditorView) => unknown) =>
      this.commands.addCommand({
        id,
        name,
        checkCallback: (checking) => {
          if (!this.editor.getFile() || this.editor.isReading()) return false;
          if (!checking) run(this.editor.editor.cm);
          return true;
        },
      });
    foldCommand("editor:toggle-fold", "Einklappen in der aktuellen Zeile umschalten", toggleFold);
    foldCommand("editor:fold-all", "Alle Überschriften und Listen einklappen", foldAll);
    foldCommand("editor:unfold-all", "Alle Überschriften und Listen ausklappen", unfoldAll);
    for (const [id, name, replace] of [
      ["editor:open-search", "Suchen in der aktuellen Notiz", false],
      ["editor:open-search-replace", "Suchen und Ersetzen in der aktuellen Notiz", true],
    ] as const) {
      this.commands.addCommand({
        id,
        name,
        checkCallback: (checking) => {
          if (!this.editor.getFile() || this.editor.isReading()) return false;
          if (!checking) openDocumentSearch(this.editor.editor.cm, replace);
          return true;
        },
      });
    }
    for (const command of FORMATTING_COMMANDS) {
      this.commands.addCommand({
        id: command.id,
        name: command.name,
        icon: command.icon,
        checkCallback: (checking) => {
          if (!this.editor.getFile() || this.editor.isReading()) return false;
          if (!checking) command.run(this.editor.editor.cm);
          return true;
        },
      });
    }
    this.commands.addCommand({
      id: "switcher:open",
      name: "Schnellwechsler: Öffnen",
      callback: () => new QuickSwitcher(this).open(),
    });
    this.commands.addCommand({ id: "app:open-settings", name: "Einstellungen öffnen", callback: () => this.setting.open() });
    this.commands.addCommand({
      id: "obsidian-web:open-uri",
      name: "Obsidian-URI ausführen (obsidian://…)",
      callback: async () => {
        const uri = await promptText(this, "Obsidian-URI einfügen", "", "Ausführen");
        if (uri && !(await this.handleObsidianUri(uri))) new Notice("Für diese URI ist kein Handler registriert.");
      },
    });
  }

  private onGlobalKey(evt: KeyboardEvent) {
    const mod = evt.metaKey || evt.ctrlKey;
    if (!mod) return;
    if (evt.altKey) {
      // `code` statt `key`: Alt verändert auf dem Mac das Zeichen (Alt+T → †).
      const tabActions: Record<string, string> = {
        KeyT: "workspace:new-tab",
        KeyN: "file-explorer:new-file",
        KeyW: "workspace:close",
        ArrowRight: "workspace:next-tab",
        ArrowLeft: "workspace:previous-tab",
      };
      const id = tabActions[evt.code];
      if (!id) return;
      evt.preventDefault();
      this.commands.executeCommandById(id);
      return;
    }
    if (evt.shiftKey) {
      if (evt.key.toLowerCase() !== "f") return;
      evt.preventDefault();
      this.commands.executeCommandById("global-search:open");
      return;
    }
    const actions: Record<string, () => unknown> = {
      p: () => this.commands.executeCommandById("command-palette:open"),
      o: () => this.commands.executeCommandById("switcher:open"),
      e: () => this.commands.executeCommandById("markdown:toggle-preview"),
      ",": () => this.setting.open(),
      s: () => this.editor.save(),
    };
    const action = actions[evt.key.toLowerCase()];
    if (!action) return;
    evt.preventDefault();
    action();
  }

  /**
   * Führt eine `obsidian://<action>?…`-URI aus, wie es das Betriebssystem bei Obsidian Desktop tut.
   * Im Browser kommen solche URIs nur per Einfügen oder als `?uri=`-Parameter an.
   */
  async handleObsidianUri(uri: string): Promise<boolean> {
    const match = /^obsidian:\/\/([^?/]+)\/?(?:\?(.*))?$/.exec(uri.trim());
    if (!match) return false;
    const handler = this.protocolHandlers.get(match[1]);
    if (!handler) return false;
    const params = Object.fromEntries(new URLSearchParams(match[2] ?? ""));
    await handler({ ...params, action: match[1] });
    return true;
  }

  private static RECENT_KEY = "recent-files";

  /** Zuletzt geöffnete Dateien (neueste zuerst), für den Schnellwechsler. */
  getRecentFiles(): string[] {
    const list = this.loadLocalStorage(App.RECENT_KEY);
    return Array.isArray(list) ? list : [];
  }

  private trackRecentFile(path: string) {
    const list = [path, ...this.getRecentFiles().filter((p) => p !== path)].slice(0, 50);
    this.saveLocalStorage(App.RECENT_KEY, list);
  }

  loadLocalStorage(key: string): any {
    try {
      const raw = localStorage.getItem(`${this.appId}-${key}`);
      return raw === null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  }

  saveLocalStorage(key: string, data: unknown): void {
    try {
      if (data === undefined || data === null) localStorage.removeItem(`${this.appId}-${key}`);
      else localStorage.setItem(`${this.appId}-${key}`, JSON.stringify(data));
    } catch {
      // localStorage nicht verfügbar (privater Modus o. ä.)
    }
  }
}
