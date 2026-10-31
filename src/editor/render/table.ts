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

export type TableAlign = "" | "left" | "center" | "right";

/** Zelle mit Position im Tabellenquelltext (ohne umgebende Leerzeichen), Text wie geschrieben. */
export interface TableCell {
  from: number;
  to: number;
  text: string;
}

/** Bearbeitbares Modell einer GFM-Tabelle (Zeile 0 = Kopfzeile, ohne Trennzeile). */
export interface TableModel {
  rows: TableCell[][];
  align: TableAlign[];
  /** Zeilenpräfix, z. B. `> ` in Zitaten. */
  prefix: string;
  /** Zeilen nach der Tabelle, die zum Block gehören (Block-ID `^abc`). */
  trailing: string[];
}

/** Zellen einer Zeile mit Offsets; `\|` und `|` in Inline-Code trennen nicht. */
function cellsWithOffsets(line: string, offset: number): TableCell[] {
  const prefix = /^\s*(?:>\s?)*\s*/.exec(line)![0];
  const bounds: number[] = [];
  let inCode = false;
  for (let i = prefix.length; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\") i++;
    else if (ch === "`") inCode = !inCode;
    else if (ch === "|" && !inCode) bounds.push(i);
  }
  const trimmed = line.trimEnd();
  const starts = [prefix.length - 1, ...bounds];
  if (bounds[0] === prefix.length) starts.shift();
  const cells: TableCell[] = [];
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i] + 1;
    const to = i + 1 < starts.length ? starts[i + 1] : trimmed.length;
    if (from > to || (i === starts.length - 1 && from === trimmed.length && trimmed.endsWith("|"))) break;
    const raw = line.slice(from, to);
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    const start = text ? from + lead : from + Math.min(1, raw.length);
    cells.push({ from: offset + start, to: offset + start + text.length, text });
  }
  return cells;
}

export function parseTable(source: string): TableModel {
  const lines = source.split("\n");
  const rows: TableCell[][] = [];
  const trailing: string[] = [];
  let align: TableAlign[] = [];
  let offset = 0;
  lines.forEach((line, i) => {
    if (/^\s*\^[\w-]+\s*$/.test(line)) trailing.push(line);
    else if (i === 1) {
      align = cellsWithOffsets(line, offset).map(({ text: c }) =>
        c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : "",
      );
    } else rows.push(cellsWithOffsets(line, offset));
    offset += line.length + 1;
  });
  return { rows, align, prefix: /^\s*(?:>\s?)*/.exec(lines[0])![0], trailing };
}

const DELIMITER: Record<TableAlign, string> = { "": "---", left: ":--", center: ":-:", right: "--:" };

/** Tabelle aus dem Modell neu schreiben (für Zeilen-/Spaltenänderungen). */
export function formatTable(rows: string[][], align: TableAlign[], prefix = "", trailing: string[] = []): string {
  const columns = Math.max(align.length, ...rows.map((r) => r.length));
  const line = (cells: string[]) => `${prefix}| ${Array.from({ length: columns }, (_, i) => cells[i] ?? "").join(" | ")} |`;
  const delimiter = `${prefix}| ${Array.from({ length: columns }, (_, i) => DELIMITER[align[i] ?? ""]).join(" | ")} |`;
  return [line(rows[0] ?? []), delimiter, ...rows.slice(1).map(line), ...trailing].join("\n");
}

/** Zelltext für die Quelle: `|` wird maskiert, Zeilenumbrüche werden zu Leerzeichen. */
export function escapeCell(text: string): string {
  return text.replace(/\n/g, " ").replace(/(?<!\\)\|/g, "\\|").trim();
}
