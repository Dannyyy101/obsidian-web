export interface FuzzyMatch {
  score: number;
  /** Positionen der getroffenen Zeichen in `target` (für Hervorhebung). */
  matches: number[];
}

const WORD_START = /[\s/_\-.()[\]]/;

/**
 * Unscharfe Suche wie in Obsidians Schnellwechsler: Alle Zeichen der Anfrage müssen in dieser
 * Reihenfolge vorkommen. Bonus für zusammenhängende Treffer und Wortanfänge, Malus für Lücken.
 * Groß-/Kleinschreibung und Unicode-Form (NFC/NFD) spielen keine Rolle.
 */
export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  const q = query.normalize("NFC").toLowerCase().replace(/\s+/g, "");
  const t = target.normalize("NFC");
  const lower = t.toLowerCase();
  if (!q) return { score: 0, matches: [] };

  // Gierig ab jeder möglichen Startposition; die beste Wertung gewinnt.
  let best: FuzzyMatch | null = null;
  for (let start = lower.indexOf(q[0]); start >= 0; start = lower.indexOf(q[0], start + 1)) {
    const match = matchFrom(q, t, lower, start);
    if (!match) break; // spätere Starts finden erst recht nicht alle Zeichen
    if (!best || match.score > best.score) best = match;
  }
  return best;
}

function matchFrom(q: string, t: string, lower: string, start: number): FuzzyMatch | null {
  const matches: number[] = [];
  let score = 0;
  let ti = start;
  for (const ch of q) {
    const found = lower.indexOf(ch, ti);
    if (found < 0) return null;
    const prev = matches[matches.length - 1];
    if (prev !== undefined && found === prev + 1) score += 8;
    else if (prev !== undefined) score -= Math.min(found - prev - 1, 10);
    if (found === 0 || WORD_START.test(t[found - 1])) score += 6;
    matches.push(found);
    ti = found + 1;
  }
  // Kürzere Ziele und frühe Treffer bevorzugen.
  return { score: score - matches[0] * 0.05 - t.length * 0.05, matches };
}
