// Ausschnitte einer Notiz für Embeds (`![[Notiz#Überschrift]]`, `![[Notiz#^block]]`). Reine
// Textlogik, ohne DOM – läuft auch im Worker.

import { obsidianMarkdownParser } from "./syntax";

const FRONTMATTER = /^---\s*\n[\s\S]*?\n(---|\.\.\.)\s*(\n|$)/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

export function stripFrontmatter(content: string): string {
  return content.replace(FRONTMATTER, "");
}

function normalizeHeading(text: string): string {
  return text.replace(/[*_`=~[\]]/g, "").trim().toLowerCase();
}

/**
 * Liefert den Ausschnitt zu `subpath` (`#A#B` → Unterüberschrift B unter A; `#^id` → Block), ohne
 * Frontmatter. Leerer Subpath = ganze Notiz; nicht gefunden = null.
 */
export function extractSection(content: string, subpath: string): string | null {
  const body = stripFrontmatter(content);
  const parts = subpath.split("#").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return body;
  const last = parts[parts.length - 1];
  return last.startsWith("^") ? extractBlock(body, last.slice(1)) : extractHeading(body, parts);
}

function extractHeading(body: string, path: string[]): string | null {
  const lines = body.split("\n");
  let from = 0;
  let to = lines.length;
  let inFence = false;
  // Pfad Schritt für Schritt einengen: jede Überschrift wird innerhalb der vorigen gesucht.
  for (const wanted of path) {
    let found = -1;
    let level = 0;
    inFence = false;
    for (let i = from; i < to; i++) {
      if (/^\s*(```|~~~)/.test(lines[i])) inFence = !inFence;
      const m = !inFence && HEADING.exec(lines[i]);
      if (!m) continue;
      if (found < 0 && normalizeHeading(m[2]) === normalizeHeading(wanted)) {
        found = i;
        level = m[1].length;
      } else if (found >= 0 && m[1].length <= level) {
        to = i;
        break;
      }
    }
    if (found < 0) return null;
    from = found;
  }
  return lines.slice(from, to).join("\n").trimEnd();
}

/** Block mit `^id`: der Listenpunkt bzw. Block (Absatz, Tabelle, Zitat …), in dem die Markierung steht. */
function extractBlock(body: string, id: string): string | null {
  const marker = new RegExp(`(^|\\s)\\^${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[ \\t]*$`, "m");
  const hit = marker.exec(body);
  if (!hit) return null;
  const pos = hit.index + hit[0].length - 1;
  const tree = obsidianMarkdownParser.parse(body);
  const strip = (text: string) => text.replace(marker, "").trimEnd();

  // `^id` allein auf einer Zeile gilt dem Block davor (Listen, Tabellen, Zitate).
  const lineStart = body.lastIndexOf("\n", hit.index) + 1;
  if (body.slice(lineStart, hit.index + hit[0].length).trim() === `^${id}`) {
    // GFM-Tabellen schließen eine solche Zeile noch als Zeile ein → nur den Teil davor nehmen.
    let before = null;
    for (let n = tree.topNode.firstChild; n && n.from < lineStart; n = n.nextSibling) before = n;
    return before ? body.slice(before.from, Math.min(before.to, lineStart)).trimEnd() : null;
  }

  let node = tree.resolveInner(pos, -1);
  let item = null;
  for (let n: typeof node | null = node; n; n = n.parent) if (n.name === "ListItem") item = item ?? n;
  if (item) {
    // Listenpunkt samt Unterpunkten, ohne die Einrückung der ersten Zeile.
    const indent = item.from - (body.lastIndexOf("\n", item.from - 1) + 1);
    const text = body.slice(item.from, item.to).trimEnd();
    return strip(text.split("\n").map((l, i) => (i === 0 ? l : l.slice(indent))).join("\n"));
  }
  while (node.parent && node.parent.name !== "Document") node = node.parent;
  return strip(body.slice(node.from, node.to));
}
