// Vault-Pfade: relativ, mit "/" getrennt, ohne führenden oder abschließenden Slash. Root ist "/".
export function normalizePath(path: string): string {
  let p = path.replace(/\\/g, "/").replace(/ | /g, " ").replace(/\/+/g, "/");
  p = p.replace(/^\/+|\/+$/g, "");
  return p === "" ? "/" : p.normalize("NFC");
}

/**
 * Nur Slashes bereinigen, Zeichen unverändert lassen. Für Pfade, die aus dem Speicher oder vom
 * Sync stammen: remotely-save vergleicht Pfade zeichengenau, eine NFC-Umwandlung würde aus einer
 * NFD-Datei auf dem Server (z. B. aus dem macOS-Finder) lokal eine andere Datei machen.
 */
export function cleanPath(path: string): string {
  const p = path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
  return p === "" ? "/" : p;
}

/** Vergleichsschlüssel, der NFC- und NFD-Schreibweisen gleichsetzt. */
export function unicodeKey(path: string): string {
  return path.normalize("NFC");
}

export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function join(dir: string, name: string): string {
  return dir === "/" || dir === "" ? name : `${dir}/${name}`;
}

/** Liefert alle Vorfahren eines Pfads, vom obersten zum direkten Elternordner. */
export function ancestors(path: string): string[] {
  const parts = path.split("/");
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
}

export function isHiddenPath(path: string): boolean {
  return path.split("/").some((part) => part.startsWith("."));
}
