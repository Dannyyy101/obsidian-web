import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { App } from "../app/app";
import type { TFile } from "../core/vault";
import { Notice } from "../ui/notice";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg",
  "image/bmp": "bmp", "image/avif": "avif",
};

/** Name wie in Obsidian: `Pasted image 20240131120000.png`. */
export function pastedImageName(date: Date, extension: string): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `Pasted image ${stamp}.${extension}`;
}

/**
 * Speichert die Dateien als Anhänge (`attachmentFolderPath`) und fügt an `pos` Links darauf ein.
 * Eingefügte Bilder ohne Namen heißen wie in Obsidian „Pasted image …“, abgelegte behalten ihren.
 */
export async function insertAttachments(app: App, view: EditorView, note: TFile, files: File[], pos: number, pasted: boolean) {
  const links: string[] = [];
  for (const file of files) {
    const extension = EXTENSION_BY_MIME[file.type] ?? /\.([^.]+)$/.exec(file.name)?.[1] ?? "bin";
    const name = pasted && file.type.startsWith("image/") ? pastedImageName(new Date(), extension) : file.name || pastedImageName(new Date(), extension);
    try {
      const path = await app.fileManager.getAvailablePathForAttachment(name, note.path);
      const created = await app.vault.createBinary(path, await file.arrayBuffer());
      links.push(app.fileManager.generateMarkdownLink(created, note.path));
    } catch (err) {
      new Notice(`„${name}“ konnte nicht gespeichert werden: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (!links.length) return;
  const insert = links.join("\n");
  const at = Math.min(pos, view.state.doc.length);
  view.dispatch({ changes: { from: at, insert }, selection: { anchor: at + insert.length }, userEvent: "input.paste" });
}

/** Bilder und andere Dateien einfügen (Zwischenablage) oder ablegen (Drag & Drop). */
export function attachmentHandling(app: App, getFile: () => TFile | null): Extension {
  return EditorView.domEventHandlers({
    paste(evt, view) {
      const data = evt.clipboardData;
      const note = getFile();
      // Text (auch HTML mit Bild) behält der Editor; nur reine Dateien werden zu Anhängen.
      if (!note || !data?.files.length || data.getData("text/plain")) return false;
      evt.preventDefault();
      const { from, to } = view.state.selection.main;
      if (from !== to) view.dispatch({ changes: { from, to }, selection: { anchor: from } });
      void insertAttachments(app, view, note, [...data.files], from, true);
      return true;
    },
    drop(evt, view) {
      const note = getFile();
      if (!note || !evt.dataTransfer?.files.length) return false;
      evt.preventDefault();
      const pos = view.posAtCoords({ x: evt.clientX, y: evt.clientY }) ?? view.state.selection.main.head;
      void insertAttachments(app, view, note, [...evt.dataTransfer.files], pos, false);
      return true;
    },
  });
}
