import type { LivePreviewHost } from "../live-preview/host";

export interface RenderContext {
  host: LivePreviewHost;
  /** Datei, relativ zu der Links aufgelöst werden. */
  sourcePath: string;
  /** Verschachtelungstiefe von Embeds (Schutz vor Endlosschleifen). */
  depth: number;
  /** Bereits eingebettete `pfad#abschnitt` auf diesem Pfad, um Zyklen zu erkennen. */
  embedded: ReadonlySet<string>;
  /** Aufgabe in der Quelldatei umschalten (`offset` = Position von `[ ]`). Nur in der Hauptansicht. */
  toggleTask?: (offset: number, checked: boolean) => void;
}

export const MAX_EMBED_DEPTH = 4;
