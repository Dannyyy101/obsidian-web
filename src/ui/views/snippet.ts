const CONTEXT = 60;

/**
 * Textausschnitt um eine Fundstelle: die Zeile (bei langen Zeilen gekürzt), alle `highlights` in
 * dieser Zeile hervorgehoben.
 */
export function renderSnippet(parent: HTMLElement, content: string, at: number, highlights: [number, number][]) {
  const lineStart = content.lastIndexOf("\n", at - 1) + 1;
  const nl = content.indexOf("\n", at);
  const lineEnd = nl < 0 ? content.length : nl;
  const from = Math.max(lineStart, at - CONTEXT);
  const to = Math.min(lineEnd, at + CONTEXT * 2);
  if (from > lineStart) parent.appendText("…");
  let pos = from;
  for (const [a, b] of highlights) {
    if (b <= from || a >= to) continue;
    const s = Math.max(a, from);
    const e = Math.min(b, to);
    if (s > pos) parent.appendText(content.slice(pos, s));
    parent.createSpan({ cls: "search-result-file-matched-text", text: content.slice(s, e) });
    pos = e;
  }
  if (pos < to) parent.appendText(content.slice(pos, to));
  if (to < lineEnd) parent.appendText("…");
}
