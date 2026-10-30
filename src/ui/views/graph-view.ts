import type { App } from "../../app/app";
import {
  buildGraph,
  buildLocalGraph,
  DEFAULT_GRAPH_SETTINGS,
  type GraphNode,
  type GraphSettings,
  type GraphSource,
  type LocalGraphOptions,
} from "../../core/graph";
import { parseQuery, searchFile } from "../../core/search";
import type { TFile } from "../../core/vault";
import { getAllTags } from "../../markdown/metadata";
import { setIcon } from "../icons";
import { Setting } from "../setting";
import type { LeafView } from "../workspace-leaf";
import { GraphRenderer } from "./graph-renderer";
import { IndexView } from "./index-view";

export const GRAPH_VIEW_TYPE = "graph";
const REBUILD_DELAY_MS = 300;

function graphSource(app: App): GraphSource {
  const { vault, metadataCache } = app;
  return {
    files: vault.getFiles(),
    resolvedLinks: metadataCache.resolvedLinks,
    unresolvedLinks: metadataCache.unresolvedLinks,
    tags: (path) => {
      const meta = metadataCache.getCache(path);
      return meta ? getAllTags(meta).map((t) => t.toLowerCase()) : [];
    },
  };
}

/** Notizen, die zur Suchanfrage passen (Syntax wie die Suche); `null` bei leerer Anfrage. */
async function matchingNotes(app: App, query: string): Promise<Set<string> | null> {
  const terms = parseQuery(query);
  if (!terms.length) return null;
  const needsContent = terms.some((t) => t.kind === "text");
  const result = new Set<string>();
  for (const file of app.vault.getMarkdownFiles()) {
    const meta = app.metadataCache.getFileCache(file);
    const match = searchFile(terms, {
      path: file.path,
      basename: file.basename,
      content: needsContent ? await app.vault.cachedRead(file) : "",
      tags: meta ? getAllTags(meta) : [],
    });
    if (match) result.add(file.path);
  }
  return result;
}

function rgbToHex(rgb: number): string {
  return `#${(rgb & 0xffffff).toString(16).padStart(6, "0")}`;
}

/** Liest und schreibt `.obsidian/graph.json` (unbekannte Felder bleiben erhalten). */
class GraphSettingsStore {
  settings: GraphSettings = { ...DEFAULT_GRAPH_SETTINGS };
  private raw: Record<string, unknown> = {};

  constructor(private app: App) {}

  private get path() {
    return `${this.app.vault.configDir}/graph.json`;
  }

  isPath(path: string) {
    return path === this.path;
  }

  async load(): Promise<void> {
    const { adapter } = this.app.vault;
    try {
      this.raw = (await adapter.exists(this.path)) ? JSON.parse(await adapter.read(this.path)) : {};
    } catch (err) {
      console.error(`${this.path} konnte nicht gelesen werden`, err);
      this.raw = {};
    }
    this.settings = { ...DEFAULT_GRAPH_SETTINGS, ...(this.raw as Partial<GraphSettings>) };
    if (!Array.isArray(this.settings.colorGroups)) this.settings.colorGroups = [];
  }

  async save(): Promise<void> {
    this.raw = { ...this.raw, ...this.settings };
    await this.app.vault.adapter.write(this.path, JSON.stringify(this.raw, null, 2));
  }
}

/** Globale Graph-Ansicht als Tab, wie Obsidians Core-Plugin „Graph“. */
export class GraphView implements LeafView {
  containerEl: HTMLElement;
  private renderer: GraphRenderer;
  private store: GraphSettingsStore;
  private controlsEl: HTMLElement;
  private timer: number | undefined;
  private saveTimer: number | undefined;
  private runId = 0;
  private dirty = true;
  private cleanups: (() => void)[] = [];

  constructor(private app: App) {
    this.containerEl = createDiv({ cls: "workspace-leaf-content", attr: { "data-type": GRAPH_VIEW_TYPE } });
    const content = this.containerEl.createDiv("view-content");
    const canvasEl = content.createDiv("graph-view-container");
    this.store = new GraphSettingsStore(app);
    this.renderer = new GraphRenderer(canvasEl, this.store.settings, {
      onOpen: (node, newLeaf) => this.open(node, newLeaf),
    });
    this.controlsEl = content.createDiv("graph-controls");

    const { vault, metadataCache } = app;
    const refs = [
      metadataCache.on("resolve", () => this.requestRebuild()),
      metadataCache.on("resolved", () => this.requestRebuild()),
      vault.on("rename", () => this.requestRebuild()),
      vault.on("delete", () => this.requestRebuild()),
      vault.on("raw", (path: string) => {
        if (!this.store.isPath(path)) return;
        void this.store.load().then(() => {
          this.renderControls();
          this.applyDisplay();
          this.requestRebuild();
        });
      }),
    ];
    this.cleanups.push(() => {
      refs.slice(0, 2).forEach((ref) => metadataCache.offref(ref));
      refs.slice(2).forEach((ref) => vault.offref(ref));
    });
    void this.store.load().then(() => {
      this.renderer.setForces(this.store.settings);
      this.applyDisplay();
      this.renderControls();
      this.requestRebuild();
    });
  }

  getViewType(): string {
    return GRAPH_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Graph";
  }

  getIcon(): string {
    return "git-fork";
  }

  onShow(): void {
    if (this.dirty) this.requestRebuild();
    this.renderer.requestDraw();
  }

  onClose(): void {
    window.clearTimeout(this.timer);
    if (this.saveTimer) {
      window.clearTimeout(this.saveTimer);
      void this.store.save();
    }
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.renderer.destroy();
  }

  private open(node: GraphNode, newLeaf: boolean) {
    if (node.type === "tag") {
      this.app.leftSidebar.activate("search");
      this.app.searchView.focus(`tag:${node.id}`);
      return;
    }
    if (node.type === "unresolved") {
      void this.app.workspace.openLinkText(node.label, "", newLeaf || "tab");
      return;
    }
    const file = this.app.vault.getFileByPath(node.id);
    // Der Graph bleibt offen: Notizen öffnen sich in einem neuen Tab.
    if (file) void this.app.openFileAt(file, undefined, undefined, true);
  }

  private requestRebuild() {
    this.dirty = true;
    if (!this.containerEl.isShown()) return; // beim Einblenden (onShow)
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.rebuild(), REBUILD_DELAY_MS);
  }

  private async rebuild() {
    const id = ++this.runId;
    this.dirty = false;
    const s = this.store.settings;
    const include = await matchingNotes(this.app, s.search);
    const groups = await Promise.all(
      s.colorGroups.map(async (g) => ({ color: rgbToHex(g.color.rgb), files: await matchingNotes(this.app, g.query) })),
    );
    if (id !== this.runId) return;
    this.renderer.nodeColor = (node) => groups.find((g) => g.files?.has(node.id))?.color ?? null;
    this.renderer.setData(buildGraph(graphSource(this.app), { ...s, include }));
  }

  private applyDisplay() {
    const s = this.store.settings;
    this.renderer.display = {
      showArrow: s.showArrow,
      textFadeMultiplier: s.textFadeMultiplier,
      nodeSizeMultiplier: s.nodeSizeMultiplier,
      lineSizeMultiplier: s.lineSizeMultiplier,
    };
    this.renderer.requestDraw();
  }

  /** Änderungen sofort anwenden, gebündelt speichern. */
  private change(update: Partial<GraphSettings>, effect: "rebuild" | "display" | "forces") {
    Object.assign(this.store.settings, update);
    if (effect === "rebuild") this.requestRebuild();
    else if (effect === "display") this.applyDisplay();
    else this.renderer.setForces(this.store.settings);
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = undefined;
      void this.store.save();
    }, 500);
  }

  private renderControls() {
    const el = this.controlsEl;
    el.empty();
    const s = this.store.settings;
    const collapsed = s as GraphSettings & { close?: boolean };
    el.toggleClass("is-close", collapsed.close === true);

    const buttons = el.createDiv("graph-control-buttons");
    const restart = buttons.createDiv({ cls: "clickable-icon graph-controls-button mod-reset", attr: { "aria-label": "Layout neu berechnen" } });
    setIcon(restart, "rotate-ccw");
    restart.addEventListener("click", () => this.renderer.restart());
    const toggle = buttons.createDiv({ cls: "clickable-icon graph-controls-button mod-close", attr: { "aria-label": "Einstellungen ein-/ausblenden" } });
    setIcon(toggle, "settings");
    toggle.addEventListener("click", () => {
      collapsed.close = !el.hasClass("is-close");
      el.toggleClass("is-close", collapsed.close);
      this.change({}, "display");
    });

    const section = (title: string, key: string, build: (body: HTMLElement) => void) => {
      const flag = `collapse-${key}` as keyof GraphSettings;
      const sectionEl = el.createDiv("tree-item graph-control-section");
      const header = sectionEl.createDiv("tree-item-self graph-control-section-header is-clickable");
      const icon = header.createDiv("tree-item-icon collapse-icon");
      setIcon(icon, "chevron-down");
      header.createDiv({ cls: "tree-item-inner", text: title });
      const body = sectionEl.createDiv("tree-item-children");
      const isCollapsed = () => (s as unknown as Record<string, unknown>)[flag] !== false;
      const apply = () => sectionEl.toggleClass("is-collapsed", isCollapsed());
      header.addEventListener("click", () => {
        (s as unknown as Record<string, unknown>)[flag] = !isCollapsed();
        apply();
        this.change({}, "display");
      });
      apply();
      build(body);
    };

    section("Filter", "filter", (body) => {
      new Setting(body).setClass("mod-search-setting").addSearch((search) => {
        search.setPlaceholder("Dateien durchsuchen …").setValue(s.search);
        search.onChange((value) => this.change({ search: value }, "rebuild"));
      });
      const toggle = (name: string, key: "showTags" | "showAttachments" | "showOrphans") =>
        new Setting(body).setName(name).addToggle((t) => t.setValue(s[key]).onChange((v) => this.change({ [key]: v }, "rebuild")));
      toggle("Tags", "showTags");
      toggle("Anhänge", "showAttachments");
      new Setting(body)
        .setName("Nur vorhandene Dateien")
        .addToggle((t) => t.setValue(s.hideUnresolved).onChange((v) => this.change({ hideUnresolved: v }, "rebuild")));
      toggle("Waisen", "showOrphans");
    });

    section("Gruppen", "color-groups", (body) => {
      const list = body.createDiv("graph-color-groups-container");
      s.colorGroups.forEach((group, i) => {
        const row = new Setting(list).setClass("graph-color-group");
        row.addText((text) => {
          text.setPlaceholder("z. B. tag:#projekt").setValue(group.query);
          text.inputEl.addEventListener("change", () => {
            group.query = text.getValue();
            this.change({}, "rebuild");
          });
        });
        const color = row.controlEl.createEl("input", { type: "color", value: rgbToHex(group.color.rgb) });
        color.addEventListener("input", () => {
          group.color = { a: 1, rgb: parseInt(color.value.slice(1), 16) };
          this.change({}, "rebuild");
        });
        row.addExtraButton((b) =>
          b
            .setIcon("x")
            .setTooltip("Gruppe entfernen")
            .onClick(() => {
              s.colorGroups.splice(i, 1);
              this.change({}, "rebuild");
              this.renderControls();
            }),
        );
      });
      new Setting(body).addButton((b) =>
        b
          .setButtonText("Neue Gruppe")
          .setCta()
          .onClick(() => {
            const hue = (s.colorGroups.length * 67) % 360;
            s.colorGroups.push({ query: "", color: { a: 1, rgb: parseInt(hslToHex(hue).slice(1), 16) } });
            this.change({}, "rebuild");
            this.renderControls();
          }),
      );
    });

    section("Anzeige", "display", (body) => {
      new Setting(body).setName("Pfeile").addToggle((t) => t.setValue(s.showArrow).onChange((v) => this.change({ showArrow: v }, "display")));
      const slider = (name: string, key: "textFadeMultiplier" | "nodeSizeMultiplier" | "lineSizeMultiplier", min: number, max: number, step: number) =>
        new Setting(body).setName(name).addSlider((sl) => sl.setLimits(min, max, step).setValue(s[key]).onChange((v) => this.change({ [key]: v }, "display")));
      slider("Text-Ausblendschwelle", "textFadeMultiplier", -3, 3, 0.1);
      slider("Knotengröße", "nodeSizeMultiplier", 0.1, 5, 0.01);
      slider("Linienstärke", "lineSizeMultiplier", 0.1, 5, 0.01);
    });

    section("Kräfte", "forces", (body) => {
      const slider = (name: string, key: "centerStrength" | "repelStrength" | "linkStrength" | "linkDistance", min: number, max: number, step: number) =>
        new Setting(body).setName(name).addSlider((sl) => sl.setLimits(min, max, step).setValue(s[key]).onChange((v) => this.change({ [key]: v }, "forces")));
      slider("Zentrierkraft", "centerStrength", 0, 1, 0.01);
      slider("Abstoßung", "repelStrength", 0, 20, 0.1);
      slider("Linkkraft", "linkStrength", 0, 1, 0.01);
      slider("Linkabstand", "linkDistance", 30, 500, 1);
    });
  }
}

function hslToHex(hue: number): string {
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    const c = 0.5 - 0.35 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

interface LocalGraphSettings extends LocalGraphOptions {
  showTags: boolean;
  showAttachments: boolean;
  hideUnresolved: boolean;
}

const LOCAL_DEFAULTS: LocalGraphSettings = {
  depth: 1,
  incoming: true,
  outgoing: true,
  neighbors: false,
  showTags: false,
  showAttachments: false,
  hideUnresolved: false,
};
const LOCAL_KEY = "local-graph";

/**
 * Lokaler Graph der aktiven Notiz in der Seitenleiste. Die Einstellungen liegen wie bei Obsidian
 * nicht in `graph.json`, sondern beim Arbeitsbereich – hier im Browser pro Vault.
 */
export class LocalGraphView extends IndexView {
  id = "localgraph";
  icon = "git-fork";
  title = "Lokaler Graph";
  private renderer: GraphRenderer;
  private settings: LocalGraphSettings;
  private controlsEl: HTMLElement;
  private center: TFile | null = null;

  constructor(app: App) {
    super(app);
    this.containerEl.addClass("local-graph-pane");
    this.containerEl.setAttr("data-type", "localgraph");
    this.settings = { ...LOCAL_DEFAULTS, ...(app.loadLocalStorage(LOCAL_KEY) ?? {}) };
    const canvasEl = this.containerEl.createDiv("graph-view-container");
    this.renderer = new GraphRenderer(canvasEl, { ...DEFAULT_GRAPH_SETTINGS, linkDistance: 150 }, {
      onOpen: (node, newLeaf) => {
        if (node.type === "unresolved") return void app.workspace.openLinkText(node.label, this.center?.path ?? "", newLeaf);
        const file = app.vault.getFileByPath(node.id);
        if (file) void app.openFileAt(file, undefined, undefined, newLeaf);
      },
    });
    this.controlsEl = this.containerEl.createDiv("graph-controls is-close");
    this.renderControls();
    app.workspace.on("file-open", () => this.requestRefresh());
    app.metadataCache.on("resolve", () => this.requestRefresh());
    app.metadataCache.on("resolved", () => this.requestRefresh());
    app.vault.on("rename", () => this.requestRefresh());
  }

  override onShow(): void {
    super.onShow();
    this.renderer.requestDraw();
  }

  protected refresh() {
    const file = this.app.workspace.getActiveFile();
    this.containerEl.querySelector(".pane-empty")?.detach();
    if (!file) {
      this.center = null;
      this.renderer.setData({ nodes: [], links: [] });
      this.containerEl.createDiv({ cls: "pane-empty", text: "Keine Datei geöffnet." });
      return;
    }
    const s = this.settings;
    const data = buildLocalGraph(graphSource(this.app), file.path, s, s);
    if (file !== this.center) {
      // Neue Mitte: Layout neu aufbauen statt von der alten Notiz aus zu verschieben.
      this.renderer.setData({ nodes: [], links: [] });
      this.renderer.restart();
    }
    this.center = file;
    this.renderer.focusedId = file.path;
    this.renderer.setData(data);
  }

  private update(change: Partial<LocalGraphSettings>) {
    Object.assign(this.settings, change);
    this.app.saveLocalStorage(LOCAL_KEY, this.settings);
    this.requestRefresh();
  }

  private renderControls() {
    const el = this.controlsEl;
    const s = this.settings;
    const button = el.createDiv({ cls: "clickable-icon graph-controls-button mod-close", attr: { "aria-label": "Einstellungen ein-/ausblenden" } });
    setIcon(button, "settings");
    button.addEventListener("click", () => el.toggleClass("is-close", !el.hasClass("is-close")));
    const body = el.createDiv("graph-control-section");
    new Setting(body)
      .setName("Tiefe")
      .addSlider((sl) => sl.setLimits(1, 5, 1).setValue(s.depth).setDynamicTooltip().onChange((v) => this.update({ depth: v })));
    const toggle = (name: string, key: Exclude<keyof LocalGraphSettings, "depth">) =>
      new Setting(body).setName(name).addToggle((t) => t.setValue(s[key]).onChange((v) => this.update({ [key]: v })));
    toggle("Eingehende Links", "incoming");
    toggle("Ausgehende Links", "outgoing");
    toggle("Links zwischen Nachbarn", "neighbors");
    toggle("Tags", "showTags");
    toggle("Anhänge", "showAttachments");
    toggle("Nur vorhandene Dateien", "hideUnresolved");
  }
}
