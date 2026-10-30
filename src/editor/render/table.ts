import type { RenderContext } from "./context";
import { renderInline } from "./inline";

/** Tabellenzeile in Zellen zerlegen: `\|` und `|` in Inline-Code trennen nicht. */
function splitRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inCode = false;
  const text = line.trim().replace(/^(>\s?)+/, "").trim();
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\" && text[i + 1] === "|") {
      current += "|";
      i++;
    } else if (ch === "`") {
      inCode = !inCode;
      current += ch;
    } else if (ch === "|" && !inCode) {
      cells.push(current);
      current = "";
    } else current += ch;
  }
  cells.push(current);
  if (text.startsWith("|")) cells.shift();
  if (text.endsWith("|") && !text.endsWith("\\|")) cells.pop();
  return cells.map((c) => c.trim());
}

/** GFM-Tabelle aus ihrer Quelle rendern (Kopfzeile, Ausrichtung, Inline-Markdown in Zellen). */
export function renderTable(source: string, parent: HTMLElement, ctx?: RenderContext): HTMLTableElement {
  const [header, delimiter, ...rows] = source.split("\n").filter((l) => !/^\s*\^[\w-]+\s*$/.test(l));
  const align = splitRow(delimiter ?? "").map((c) =>
    c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : "",
  );
  const table = parent.createEl("table");
  const fill = (row: HTMLElement, cells: string[], tag: "th" | "td") => {
    cells.forEach((cell, i) => {
      const el = row.createEl(tag);
      if (align[i]) el.style.textAlign = align[i];
      renderInline(cell, el, ctx);
    });
  };
  fill(table.createEl("thead").createEl("tr"), splitRow(header), "th");
  const body = table.createEl("tbody");
  for (const row of rows) fill(body.createEl("tr"), splitRow(row), "td");
  return table;
}
