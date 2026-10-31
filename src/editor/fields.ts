// CodeMirror-Felder, über die Obsidian Editor-Erweiterungen von Plugins Auskunft gibt
// (`editorInfoField`, `editorLivePreviewField`, `livePreviewState` aus obsidian.d.ts).
import { StateEffect, StateField } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";
import type { App } from "../app/app";
import type { TFile } from "../core/vault";

/** Entspricht Obsidians `MarkdownFileInfo`, soweit obsidian-web es schon abbildet. */
export interface MarkdownFileInfo {
  app: App;
  file: TFile | null;
}

/** Datei und App des Editors; wird beim Öffnen einer Datei mit dem neuen Zustand gesetzt. */
export const editorInfoField = StateField.define<MarkdownFileInfo>({
  create: () => {
    throw new Error("editorInfoField muss mit init() belegt werden");
  },
  update: (value) => value,
});

/** @internal Schaltet `editorLivePreviewField` um (Live Preview ↔ Quellmodus). */
export const setLivePreview = StateEffect.define<boolean>();

/** Ob der Editor in Live Preview (true) oder im Quellmodus (false) ist. */
export const editorLivePreviewField = StateField.define<boolean>({
  create: () => true,
  update: (value, tr) => {
    for (const effect of tr.effects) if (effect.is(setLivePreview)) value = effect.value;
    return value;
  },
});

/** Wie Obsidians `livePreviewState`: `mousedown` ist true, solange die Maus im Editor gedrückt ist. */
export const livePreviewState = ViewPlugin.fromClass(
  class {
    mousedown = false;
    private onUp = () => (this.mousedown = false);

    constructor() {
      document.addEventListener("mouseup", this.onUp, true);
    }

    destroy() {
      document.removeEventListener("mouseup", this.onUp, true);
    }
  },
  {
    eventHandlers: {
      mousedown() {
        this.mousedown = true;
      },
    },
  },
);
