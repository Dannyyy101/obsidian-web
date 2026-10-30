// Volltextsuche wie Obsidians Suche (Teilmenge): Wörter (UND), "Phrase", -Ausschluss,
// file:, path:, tag:. Groß-/Kleinschreibung und NFC/NFD spielen keine Rolle.

export interface SearchTerm {
  kind: "text" | "file" | "path" | "tag";
  value: string;
  negate: boolean;
}

export interface SearchInput {
  path: string;
  basename: string;
  content: string;
  tags: string[];
}

export interface SearchMatch {
  /** Treffer im Inhalt als [start, end) */
  matches: [number, number][];
  /** Treffer (auch) im Dateinamen */
  inName: boolean;
}

const TOKEN = /(-?)(?:(file|path|tag):)?(?:"([^"]*)"|(\S+))/g;

export function parseQuery(query: string): SearchTerm[] {
  const terms: SearchTerm[] = [];
  for (const m of query.matchAll(TOKEN)) {
    const value = (m[3] ?? m[4] ?? "").normalize("NFC");
    if (!value) continue;
    terms.push({ kind: (m[2] as SearchTerm["kind"]) ?? "text", value, negate: m[1] === "-" });
  }
  return terms;
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includes(haystack: string, needle: string) {
  return haystack.normalize("NFC").toLowerCase().includes(needle.toLowerCase());
}

/** Alle Fundstellen (ohne Überlappung) im Originaltext. */
function findAll(content: string, needle: string): [number, number][] {
  const re = new RegExp(escape(needle), "giu");
  const out: [number, number][] = [];
  for (const m of content.matchAll(re)) out.push([m.index!, m.index! + m[0].length]);
  return out;
}

export function searchFile(terms: SearchTerm[], input: SearchInput): SearchMatch | null {
  if (!terms.length) return null;
  // Inhalt einmal nach NFC: Positionen beziehen sich dann auf diesen Text (der Editor speichert NFC).
  const content = input.content.normalize("NFC");
  const matches: [number, number][] = [];
  let inName = false;

  for (const term of terms) {
    let hit: boolean;
    switch (term.kind) {
      case "file":
        hit = includes(input.basename, term.value);
        break;
      case "path":
        hit = includes(input.path, term.value);
        break;
      case "tag": {
        const wanted = `#${term.value.replace(/^#/, "")}`.toLowerCase();
        hit = input.tags.some((t) => {
          const tag = t.toLowerCase();
          return tag === wanted || tag.startsWith(`${wanted}/`);
        });
        break;
      }
      default: {
        const found = findAll(content, term.value);
        const nameHit = includes(input.basename, term.value);
        hit = found.length > 0 || nameHit;
        if (hit && !term.negate) {
          matches.push(...found);
          inName ||= nameHit;
        }
      }
    }
    if (hit === term.negate) return null;
  }
  matches.sort((a, b) => a[0] - b[0]);
  return { matches, inName };
}
