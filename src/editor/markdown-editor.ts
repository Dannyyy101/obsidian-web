import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import { drawSelection, dropCursor, EditorView, keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import type { App } from "../app/app";
import type { TAbstractFile, TFile } from "../core/vault";
import { obsidianLezerExtensions } from "../markdown/syntax";
import { setIcon } from "../ui/icons";
import { Notice } from "../ui/notice";
import { join } from "../shared/path";
import { autoPair } from "./auto-pair";
import { Editor } from "./editor";
import { editorInfoField, editorLivePreviewField, livePreviewState, setLivePreview } from "./fields";
import { inlineTitle } from "./inline-title";
import { listEditing } from "./lists";
import { editorSuggest } from "./suggest/editor-suggest";
import { LinkSuggest } from "./suggest/link-suggest";
import { TagSuggest } from "./suggest/tag-suggest";
import { livePreview, sourceModeDecorations } from "./live-preview/decorations";
import { codeHighlightStyle, codeLanguages } from "./render/code";
import { renderMarkdown } from "./render/markdown";
import { type LivePreviewHost, mimeType } from "./live-preview/host";

const SAVE_DELAY_MS = 2000;

// Klassennamen wie in Obsidians Quellmodus, damit Themes greifen.
const obsidianHighlight = HighlightStyle.define([
  { tag: tags.heading1, class: "cm-header cm-header-1" },
  { tag: tags.heading2, class: "cm-header cm-header-2" },
  { tag: tags.heading3, class: "cm-header cm-header-3" },
  { tag: tags.heading4, class: "cm-header cm-header-4" },
  { tag: tags.heading5, class: "cm-header cm-header-5" },
  { tag: tags.heading6, class: "cm-header cm-header-6" },
  { tag: tags.strong, class: "cm-strong" },
  { tag: tags.emphasis, class: "cm-em" },
  { tag: tags.strikethrough, class: "cm-strikethrough" },
  { tag: tags.link, class: "cm-link" },
  { tag: tags.url, class: "cm-url" },
  { tag: tags.monospace, class: "cm-inline-code" },
  { tag: tags.quote, class: "cm-quote" },
  { tag: [tags.processingInstruction, tags.meta], class: "cm-formatting" },
  { tag: tags.list, class: "cm-list" },
]);

/**
 * Markdown-Editor für genau eine Datei, wahlweise in Live Preview oder Quellmodus (Einstellung
 * `livePreview` in `.obsidian/app.json`, wie in Obsidian). Speichert verzögert und lädt die Datei
 * neu, wenn sie von außen (z. B. durch den Sync) geändert wird.
 */
export class MarkdownEditor {
  containerEl: HTMLElement;
  /** Kopfzeile links/rechts, z. B. für die Umschalter der Seitenleisten. */
  headerLeftEl: HTMLElement;
  actionsEl: HTMLElement;
  /** Inhalt unter der Kopfzeile (Obsidians `view.contentEl`). */
  contentEl: HTMLElement;
  /** Obsidians `Editor`-Fassade für Plugins. */
  readonly editor: Editor;
  private titleEl: HTMLElement;
  private modeButtonEl: HTMLElement;
  private readingButtonEl: HTMLElement;
  private emptyEl: HTMLElement;
  private sourceViewEl: HTMLElement;
  private readingEl: HTMLElement;
  /** Lesemodus (gerendert) statt Bearbeiten – wie Obsidians „Aktuelle Ansicht“. */
  private reading = false;
  private view: EditorView;
  private file: TFile | null = null;
  private lastSaved = "";
  private saveTimer: number | undefined;
  private applyingExternal = false;
  private mode = new Compartment();
  private title = new Compartment();
  /** Editor-Erweiterungen der Plugins (`registerEditorExtension`). */
  private pluginExtensions = new Compartment();
  private host: LivePreviewHost;
  private imageUrls = new Map<string, { mtime: number; url: string }>();

  private get vault() {
    return this.app.vault;
  }

  /** Aufräumarbeiten für `destroy` (Event-Listener). */
  private cleanups: (() => void)[] = [];

  /**
   * @param onFile meldet die geöffnete Datei (oder null) an den Tab, zu dem der Editor gehört.
   */
  constructor(
    parent: HTMLElement,
    private app: App,
    private onFile: (file: TFile | null) => void,
  ) {
    const vault = app.vault;
    this.host = {
      openLink: (linktext, newTab, source) => void app.workspace.openLinkText(linktext, source || this.file?.path || "", newTab),
      isResolved: (linktext, source) => !!this.resolve(linktext, source),
      loadResource: (linkpath, source) => this.loadResource(linkpath, source),
      loadNote: async (linkpath, source) => {
        const file = this.resolve(linkpath, source);
        return file && file.extension === "md" ? { path: file.path, content: await this.vault.cachedRead(file) } : null;
      },
    };
    this.containerEl = parent.createDiv("workspace-leaf-content markdown-view");
    const header = this.containerEl.createDiv("view-header");
    this.headerLeftEl = header.createDiv("view-header-left");
    this.titleEl = header.createDiv("view-header-title");
    const actions = (this.actionsEl = header.createDiv("view-actions"));
    this.modeButtonEl = actions.createDiv("clickable-icon view-action");
    this.modeButtonEl.addEventListener("click", () => this.toggleSourceMode());
    this.readingButtonEl = actions.createDiv("clickable-icon view-action");
    this.readingButtonEl.addEventListener("click", () => this.toggleReadingView());
    this.updateModeButton();
    const content = (this.contentEl = this.containerEl.createDiv("view-content"));
    this.emptyEl = content.createDiv("empty-state");
    this.renderEmptyState();
    this.sourceViewEl = content.createDiv("markdown-source-view mod-cm6");
    this.sourceViewEl.toggleClass("is-readable-line-width", this.isReadableLineWidth());
    this.view = new EditorView({
      parent: this.sourceViewEl,
      state: this.createState(""),
    });
    this.editor = new Editor(this.view);
    this.readingEl = content.createDiv("markdown-reading-view");
    this.showEmpty(true);

    const refs = [
      vault.on("modify", (file: TAbstractFile) => file === this.file && void this.onExternalModify()),
      vault.on("rename", (file: TAbstractFile) => {
        if (file !== this.file) return;
        this.updateTitle();
        this.view.dispatch({ effects: this.title.reconfigure(this.titleExtension()) });
        this.onFile(this.file);
      }),
      vault.on("delete", (file: TAbstractFile) => file === this.file && this.close()),
    ];
    const onUnload = () => void this.save();
    const onHide = () => document.hidden && void this.save();
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("visibilitychange", onHide);
    this.cleanups.push(
      () => refs.forEach((ref) => vault.offref(ref)),
      () => window.removeEventListener("beforeunload", onUnload),
      () => document.removeEventListener("visibilitychange", onHide),
    );
  }

  /** Speichert und baut den Editor ab (Tab geschlossen). */
  async destroy(): Promise<void> {
    await this.save();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    for (const { url } of this.imageUrls.values()) URL.revokeObjectURL(url);
    this.view.destroy();
    this.containerEl.detach();
  }

  /** Leerer Tab wie in Obsidian: Titel und die naheliegenden Aktionen. */
  private renderEmptyState() {
    const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Strg+";
    const alt = mod === "⌘" ? "⌥" : "Alt+";
    const container = this.emptyEl.createDiv("empty-state-container");
    container.createDiv({ cls: "empty-state-title", text: "Keine Datei geöffnet" });
    const actions = container.createDiv("empty-state-action-list");
    const entries: [string, string, string][] = [
      ["Neue Notiz anlegen", `${mod}${alt}N`, "file-explorer:new-file"],
      ["Datei öffnen", `${mod}O`, "switcher:open"],
      ["Tab schließen", `${mod}${alt}W`, "workspace:close"],
    ];
    for (const [label, hotkey, command] of entries) {
      const action = actions.createDiv({ cls: "empty-state-action", text: label });
      action.createSpan({ cls: "empty-state-hotkey", text: hotkey });
      action.addEventListener("click", () => this.app.commands.executeCommandById(command));
    }
  }

  focus(): void {
    if (this.reading) this.readingEl.focus();
    else this.view.focus();
  }

  /** Obsidians „Lesbare Zeilenlänge“ (`readableLineLength`, standardmäßig an). Aus = volle Breite. */
  private isReadableLineWidth(): boolean {
    return this.vault.getConfig("readableLineLength") !== false;
  }

  /** Editor-Einstellungen aus `app.json` neu anwenden (lesbare Zeilenlänge, Inline-Titel). */
  applySettings(): void {
    this.sourceViewEl.toggleClass("is-readable-line-width", this.isReadableLineWidth());
    this.view.dispatch({ effects: this.title.reconfigure(this.titleExtension()) });
    this.renderReading();
  }

  /** Live Preview/Quellmodus neu anwenden (nach Änderung von `livePreview`, auch in anderen Tabs). */
  reconfigureMode(): void {
    this.view.dispatch({
      effects: [this.mode.reconfigure(this.modeExtension()), setLivePreview.of(this.isLivePreview())],
    });
    this.updateModeButton();
  }

  /** Plugin-Erweiterungen neu einlesen (entspricht Obsidians `workspace.updateOptions`). */
  reconfigurePluginExtensions(): void {
    this.view.dispatch({ effects: this.pluginExtensions.reconfigure(this.app.workspace.getEditorExtensions()) });
  }

  private createState(doc: string): EditorState {
    return EditorState.create({
      doc,
      extensions: [
        history(),
        editorSuggest([new LinkSuggest(this.app), new TagSuggest(this.app)], () => this.file),
        drawSelection(),
        dropCursor(),
        highlightSelectionMatches(),
        autoPair({
          autoPairBrackets: this.vault.getConfig("autoPairBrackets") !== false,
          autoPairMarkdown: this.vault.getConfig("autoPairMarkdown") !== false,
        }),
        listEditing({
          useTab: this.vault.getConfig("useTab") !== false,
          tabSize: Number(this.vault.getConfig("tabSize")) || 4,
          smartIndentList: this.vault.getConfig("smartIndentList") !== false,
        }),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        markdown({ base: markdownLanguage, extensions: obsidianLezerExtensions, codeLanguages }),
        syntaxHighlighting(obsidianHighlight),
        syntaxHighlighting(codeHighlightStyle),
        this.mode.of(this.modeExtension()),
        this.title.of(this.titleExtension()),
        editorInfoField.init(() => ({ app: this.app, file: this.file, editor: this.editor })),
        editorLivePreviewField.init(() => this.isLivePreview()),
        livePreviewState,
        this.pluginExtensions.of(this.app.workspace.getEditorExtensions()),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ spellcheck: "true" }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !this.applyingExternal) this.scheduleSave();
        }),
      ],
    });
  }

  getFile(): TFile | null {
    return this.file;
  }

  private titleExtension() {
    const file = this.file;
    if (!file || this.vault.getConfig("showInlineTitle") === false) return [];
    return inlineTitle(file.basename, (name) => void this.renameFromTitle(file, name));
  }

  private async renameFromTitle(file: TFile, name: string) {
    const reset = () => this.view.dispatch({ effects: this.title.reconfigure(this.titleExtension()) });
    if (/[\\/:]/.test(name)) {
      new Notice("Dateinamen dürfen keine der Zeichen \\ / : enthalten.");
      return reset();
    }
    const newPath = join(file.parent?.path ?? "/", file.extension ? `${name}.${file.extension}` : name);
    if (this.vault.getAbstractFileByPath(newPath)) {
      new Notice("Es gibt bereits eine Datei mit diesem Namen.");
      return reset();
    }
    try {
      await this.app.fileManager.renameFile(file, newPath);
    } catch (err) {
      new Notice(`Umbenennen fehlgeschlagen: ${err instanceof Error ? err.message : err}`);
      reset();
    }
  }

  private isLivePreview(): boolean {
    return this.vault.getConfig("livePreview") !== false;
  }

  private modeExtension() {
    return this.isLivePreview() ? livePreview(this.host) : sourceModeDecorations(this.host);
  }

  private updateModeButton() {
    const live = this.isLivePreview();
    setIcon(this.modeButtonEl, live ? "pencil-line" : "code-xml");
    this.modeButtonEl.setAttr("aria-label", live ? "Live Preview – klicken für Quellmodus" : "Quellmodus – klicken für Live Preview");
    this.modeButtonEl.toggle(!this.reading);
    setIcon(this.readingButtonEl, this.reading ? "pencil" : "book-open");
    this.readingButtonEl.setAttr("aria-label", this.reading ? "Lesemodus – klicken zum Bearbeiten" : "Bearbeiten – klicken für Lesemodus");
  }

  isReading(): boolean {
    return this.reading;
  }

  /** Entspricht Obsidians „Lesemodus umschalten“ (`markdown:toggle-preview`, Strg/Cmd+E). */
  async toggleReadingView(): Promise<void> {
    await this.save();
    this.reading = !this.reading;
    this.updateModeButton();
    this.showEmpty(!this.file);
    if (this.reading) this.renderReading();
    else this.view.focus();
  }

  /** Rendert die Notiz in den Lesemodus und behält die Scrollposition. */
  private renderReading() {
    const file = this.file;
    if (!this.reading || !file) return;
    const scroll = this.readingEl.scrollTop;
    this.readingEl.empty();
    const previewEl = this.readingEl.createDiv("markdown-preview-view markdown-rendered");
    previewEl.toggleClass("is-readable-line-width", this.isReadableLineWidth());
    const sizer = previewEl.createDiv("markdown-preview-sizer markdown-preview-section");
    if (this.vault.getConfig("showInlineTitle") !== false) sizer.createDiv({ cls: "inline-title", text: file.basename });
    renderMarkdown(this.view.state.doc.toString(), sizer.createDiv(), {
      host: this.host,
      sourcePath: file.path,
      depth: 0,
      embedded: new Set([file.path]),
      toggleTask: (offset, checked) => {
        // Über den Editor-Zustand ändern: hält Undo und verzögertes Speichern konsistent.
        this.view.dispatch({ changes: { from: offset + 1, to: offset + 2, insert: checked ? " " : "x" } });
        this.renderReading();
      },
    });
    this.readingEl.scrollTop = scroll;
  }

  /** Entspricht Obsidians Befehl „Quellmodus umschalten“ (`editor:toggle-source`). */
  async toggleSourceMode(): Promise<void> {
    await this.vault.setConfig("livePreview", !this.isLivePreview());
    this.app.workspace.iterateEditors((editor) => editor.reconfigureMode());
  }

  private resolve(linktext: string, sourcePath?: string) {
    return this.app.metadataCache.getFirstLinkpathDest(linktext, sourcePath || this.file?.path || "");
  }

  /** Datei aus dem Vault als Blob-URL (zwischengespeichert, bis sich die Datei ändert). */
  private async loadResource(linkpath: string, sourcePath?: string): Promise<string | null> {
    const file = this.resolve(linkpath, sourcePath);
    if (!file) return null;
    const cached = this.imageUrls.get(file.path);
    if (cached?.mtime === file.stat.mtime) return cached.url;
    if (cached) URL.revokeObjectURL(cached.url);
    const url = URL.createObjectURL(new Blob([await this.vault.readBinary(file)], { type: mimeType(file.extension) }));
    this.imageUrls.set(file.path, { mtime: file.stat.mtime, url });
    return url;
  }

  /** Cursor an eine Überschrift (`#Abschnitt`) oder einen Block (`#^id`) setzen. */
  scrollToSubpath(subpath: string): void {
    const target = subpath.replace(/^#/, "").trim();
    if (!target) return;
    if (this.reading) {
      const heading = [...this.readingEl.querySelectorAll<HTMLElement>("[data-heading]")].find(
        (h) => h.dataset.heading?.trim().toLowerCase() === target.toLowerCase(),
      );
      heading?.scrollIntoView({ block: "start" });
      return;
    }
    const doc = this.view.state.doc;
    for (let n = 1; n <= doc.lines; n++) {
      const text = doc.line(n).text;
      const hit = target.startsWith("^")
        ? text.trimEnd().endsWith(` ${target}`) || text.trimEnd() === target
        : /^#{1,6}\s/.test(text) && text.replace(/^#{1,6}\s+/, "").trim().toLowerCase() === target.toLowerCase();
      if (hit) {
        const pos = doc.line(n).from;
        this.view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "start" }) });
        return;
      }
    }
  }

  /** Bereich auswählen und in die Mitte scrollen (Suche, Backlinks, Gliederung). */
  async scrollToRange(from: number, to = from): Promise<void> {
    if (this.reading) await this.toggleReadingView();
    const len = this.view.state.doc.length;
    const anchor = Math.min(from, len);
    this.view.dispatch({
      selection: { anchor, head: Math.min(to, len) },
      effects: EditorView.scrollIntoView(anchor, { y: "center" }),
    });
    this.view.focus();
  }

  async openFile(file: TFile): Promise<void> {
    if (file === this.file) return this.view.focus();
    await this.save();
    let content: string;
    try {
      content = await this.vault.read(file);
    } catch (err) {
      console.error(err);
      new Notice(`„${file.name}“ konnte nicht geöffnet werden.`);
      return;
    }
    this.file = file;
    this.lastSaved = content;
    this.view.setState(this.createState(content));
    this.updateTitle();
    this.showEmpty(false);
    this.onFile(file);
    if (this.reading) {
      this.readingEl.scrollTop = 0;
      this.renderReading();
    } else {
      this.view.focus();
    }
  }

  close(): void {
    window.clearTimeout(this.saveTimer);
    this.file = null;
    this.lastSaved = "";
    this.view.setState(this.createState(""));
    this.showEmpty(true);
    this.onFile(null);
  }

  private showEmpty(empty: boolean) {
    this.emptyEl.toggle(empty);
    this.view.dom.toggle(!empty && !this.reading);
    this.readingEl.toggle(!empty && this.reading);
    this.titleEl.toggle(!empty);
  }

  private updateTitle() {
    this.titleEl.setText(this.file?.basename ?? "");
  }

  private scheduleSave() {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.save(), SAVE_DELAY_MS);
  }

  /** Schreibt ausstehende Änderungen sofort (vor Dateiwechsel, Sync oder Schließen). */
  async save(): Promise<void> {
    window.clearTimeout(this.saveTimer);
    const file = this.file;
    const content = this.view.state.doc.toString();
    if (!file || content === this.lastSaved) return;
    this.lastSaved = content;
    await this.vault.modify(file, content);
  }

  private isDirty(): boolean {
    return this.view.state.doc.toString() !== this.lastSaved;
  }

  /**
   * Fremdänderung übernehmen, solange lokal nichts Ungespeichertes vorliegt. Ungespeicherte
   * Änderungen gewinnen: Sie werden gespeichert und beim nächsten Sync als neuer Stand hochgeladen.
   */
  private async onExternalModify() {
    const file = this.file;
    if (!file || this.isDirty()) return;
    const content = await this.vault.read(file);
    if (file !== this.file || content === this.lastSaved || this.isDirty()) return;
    this.lastSaved = content;
    const { head } = this.view.state.selection.main;
    this.applyingExternal = true;
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: content },
      selection: { anchor: Math.min(head, content.length) },
    });
    this.applyingExternal = false;
    this.renderReading();
  }
}
