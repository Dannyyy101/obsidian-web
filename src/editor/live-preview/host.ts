/**
 * Was Live Preview und Renderer von ihrer Umgebung brauchen (Navigation, Dateizugriff). Ohne
 * `sourcePath` gilt die im Editor geöffnete Datei als Ausgangspunkt der Linkauflösung.
 */
export interface LivePreviewHost {
  /** Interner Link (Wikilink oder relativer Markdown-Link). */
  openLink(linktext: string, newTab: boolean, sourcePath?: string): void;
  /** Ob ein interner Link auf eine vorhandene Datei zeigt. */
  isResolved(linktext: string, sourcePath?: string): boolean;
  /** Anzeigbare URL (Blob) für eine Datei im Vault – Bild, Audio, Video, PDF –, oder null. */
  loadResource(linkpath: string, sourcePath?: string): Promise<string | null>;
  /** Inhalt einer verlinkten Notiz für Embeds, oder null. */
  loadNote(linkpath: string, sourcePath?: string): Promise<{ path: string; content: string } | null>;
}

export function isExternalUrl(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url);
}

export const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "avif"]);
export const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "ogg", "flac", "3gp", "webm"]);
export const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "mkv", "ogv"]);

const MIME: Record<string, string> = {
  svg: "image/svg+xml", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  bmp: "image/bmp", webp: "image/webp", avif: "image/avif", mp3: "audio/mpeg", wav: "audio/wav",
  m4a: "audio/mp4", ogg: "audio/ogg", flac: "audio/flac", "3gp": "audio/3gpp", webm: "audio/webm",
  mp4: "video/mp4", mov: "video/quicktime", mkv: "video/x-matroska", ogv: "video/ogg", pdf: "application/pdf",
};

export function mimeType(extension: string): string {
  return MIME[extension] ?? "application/octet-stream";
}

export function extensionOf(path: string): string {
  const m = /\.([^./]+)$/.exec(path.split("#")[0]);
  return m ? m[1].toLowerCase() : "";
}

/** `Ziel#Abschnitt|Alias` zerlegen. */
export function splitWikilink(inner: string): { target: string; alias: string | null } {
  const pipe = inner.indexOf("|");
  return pipe < 0 ? { target: inner, alias: null } : { target: inner.slice(0, pipe), alias: inner.slice(pipe + 1) };
}

/** Anzeigetext wie in Obsidian: Alias, sonst `Notiz > Abschnitt`. */
export function wikilinkDisplay(inner: string): string {
  const { target, alias } = splitWikilink(inner);
  if (alias) return alias;
  const [path, ...sub] = target.split("#");
  return [path, ...sub.map((s) => s.replace(/^\^/, ""))].filter(Boolean).join(" > ");
}
