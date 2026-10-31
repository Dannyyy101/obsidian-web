import type { App } from "../app/app";
import type { TFile } from "../core/vault";
import type { Editor } from "../editor/editor";
import type { MarkdownEditor } from "../editor/markdown-editor";
import type { WorkspaceLeaf } from "./workspace-leaf";

/**
 * Entspricht Obsidians `MarkdownView`: die Ansicht eines Tabs mit geöffneter Notiz. Sie umhüllt den
 * `MarkdownEditor` des Tabs; `leaf.view` liefert sie, solange der Tab eine Datei zeigt.
 */
export class MarkdownView {
  app: App;
  leaf: WorkspaceLeaf;
  editor: Editor;
  containerEl: HTMLElement;
  contentEl: HTMLElement;

  constructor(
    leaf: WorkspaceLeaf,
    app: App,
    private markdownEditor: MarkdownEditor,
  ) {
    this.leaf = leaf;
    this.app = app;
    this.editor = markdownEditor.editor;
    this.containerEl = markdownEditor.containerEl;
    this.contentEl = markdownEditor.contentEl;
  }

  get file(): TFile | null {
    return this.markdownEditor.getFile();
  }

  getViewType(): string {
    return "markdown";
  }

  getDisplayText(): string {
    return this.file?.basename ?? "";
  }

  getIcon(): string {
    return "file-text";
  }

  /** `preview` im Lesemodus, sonst `source` (auch in Live Preview, wie in Obsidian). */
  getMode(): "source" | "preview" {
    return this.markdownEditor.isReading() ? "preview" : "source";
  }

  getViewData(): string {
    return this.editor.getValue();
  }

  setViewData(data: string, clear: boolean): void {
    this.editor.setValue(data);
    if (clear) this.editor.setCursor(0, 0);
  }

  async save(): Promise<void> {
    await this.markdownEditor.save();
  }
}
