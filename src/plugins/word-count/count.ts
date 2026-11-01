export interface WordCount {
  words: number;
  characters: number;
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
/** Chinesische und japanische Schriftzeichen zählen einzeln als Wort, sie stehen ohne Leerzeichen. */
const CJK = "\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}";
const TOKEN = new RegExp(`[${CJK}]|[^\\s${CJK}]+`, "gu");
const WORD_CHAR = /[\p{L}\p{N}]/u;

/** Entfernt Zeilenmarker (Überschrift, Zitat, Callout, Liste, Aufgabe, Tabelle) und reine Syntaxzeilen. */
function stripLine(line: string): string {
  if (/^\s*(?:`{3,}|~{3,})/.test(line)) return "";
  if (/^\s*(?:[-*_]\s*){3,}$/.test(line)) return "";
  if (/^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/.test(line)) return "";
  return line
    .replace(/^\s*(?:>\s?)+/, "")
    .replace(/^\[![^\]]*\][+-]?\s*/, "")
    .replace(/^\s*#{1,6}(?=\s|$)/, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?/, "")
    .replace(/\s+\^[\w-]+$/, "")
    .trim();
}

/** Entfernt Inline-Syntax und behält den sichtbaren Text. */
function stripInline(text: string): string {
  return text
    .replace(/!\[\[[^\]]*\]\]/g, "")
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
    .replace(/\[\[([^\]]*)\]\]/g, (_, target: string) => target.replace(/[#^]+/g, " ").trim())
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\^[^\]]+\]/g, "")
    .replace(/\*+|~~|==|`+/g, "")
    .replace(/(^|[^\p{L}\p{N}])_+|_+(?=[^\p{L}\p{N}]|$)/gu, "$1");
}

/** Sichtbarer Text ohne Frontmatter, Kommentare und Markdown-Syntax, zeilenweise. */
export function visibleText(markdown: string): string[] {
  const text = markdown.replace(FRONTMATTER, "").replace(/%%[\s\S]*?(?:%%|$)/g, "").replace(/<!--[\s\S]*?(?:-->|$)/g, "");
  return text
    .split(/\r?\n/)
    // Tabellenzellen erst nach den Links trennen, sonst zerfällt `[[Ziel|Alias]]`.
    .map((line) => stripInline(stripLine(line)).replace(/\|/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Zählt Wörter und Zeichen wie Obsidians Core-Plugin „Wortzählung“: Frontmatter, Kommentare und
 * Syntax zählen nicht. Zeichen sind Unicode-Codepoints ohne Zeilenumbrüche, Leerzeichen zählen mit.
 */
export function countWords(markdown: string): WordCount {
  let words = 0;
  let characters = 0;
  for (const line of visibleText(markdown)) {
    characters += [...line].length;
    for (const token of line.match(TOKEN) ?? []) if (WORD_CHAR.test(token)) words++;
  }
  return { words, characters };
}
