// Metadaten einer Notiz wie Obsidians `CachedMetadata`. Reine Funktion ohne DOM – läuft im Worker.
import { parse as parseYamlText } from "yaml";
import { obsidianMarkdownParser } from "./syntax";

export interface Loc {
  line: number;
  col: number;
  offset: number;
}

export interface Pos {
  start: Loc;
  end: Loc;
}

export interface ReferenceCache {
  /** Linkziel ohne Alias, z. B. `Notiz#Abschnitt` */
  link: string;
  /** Originaltext, z. B. `[[Notiz#Abschnitt|Alias]]` */
  original: string;
  displayText?: string;
  position: Pos;
}

export type LinkCache = ReferenceCache;
export type EmbedCache = ReferenceCache;

export interface FrontmatterLinkCache {
  key: string;
  link: string;
  original: string;
  displayText?: string;
}

export interface TagCache {
  tag: string;
  position: Pos;
}

export interface HeadingCache {
  heading: string;
  level: number;
  position: Pos;
}

export interface BlockCache {
  id: string;
  position: Pos;
}

/** Fußnotendefinition `[^id]: …` wie Obsidians `FootnoteCache`. */
export interface FootnoteCache {
  id: string;
  position: Pos;
}

export interface CachedMetadata {
  links?: LinkCache[];
  embeds?: EmbedCache[];
  tags?: TagCache[];
  headings?: HeadingCache[];
  blocks?: Record<string, BlockCache>;
  footnotes?: FootnoteCache[];
  frontmatter?: Record<string, unknown>;
  frontmatterPosition?: Pos;
  frontmatterLinks?: FrontmatterLinkCache[];
}

const WIKILINK_IN_TEXT = /\[\[([^\]\n]+?)\]\]/g;
const BLOCK_ID = /(?:^|\s)\^([A-Za-z0-9-]+)\s*$/;

function locator(text: string) {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lineStarts.push(i + 1);
  const loc = (offset: number): Loc => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo, col: offset - lineStarts[lo], offset };
  };
  return (from: number, to: number): Pos => ({ start: loc(from), end: loc(to) });
}

function splitAlias(inner: string): { link: string; displayText?: string } {
  const pipe = inner.indexOf("|");
  return pipe < 0 ? { link: inner } : { link: inner.slice(0, pipe), displayText: inner.slice(pipe + 1) };
}

/** Obsidians `parseYaml`: Frontmatter-YAML → Objekt (bei Fehlern null). */
export function parseYaml(yaml: string): unknown {
  return parseYamlText(yaml);
}

/** Tags aus `tags`/`tag` im Frontmatter (Liste oder Komma-/Leerzeichen-getrennter Text). */
export function frontmatterTags(frontmatter: Record<string, unknown> | undefined): string[] {
  if (!frontmatter) return [];
  const raw = frontmatter.tags ?? frontmatter.tag;
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,\s]+/) : [];
  return list
    .filter((t): t is string | number => typeof t === "string" || typeof t === "number")
    .map((t) => String(t).trim().replace(/^#/, ""))
    .filter(Boolean)
    .map((t) => `#${t}`);
}

/** Obsidians `parseFrontMatterEntry`: Wert zum ersten passenden Schlüssel (Text oder RegExp). */
export function parseFrontMatterEntry(frontmatter: Record<string, unknown> | null | undefined, key: string | RegExp): unknown {
  if (!frontmatter) return null;
  if (typeof key === "string") return key in frontmatter ? frontmatter[key] : null;
  for (const k of Object.keys(frontmatter)) if (key.test(k)) return frontmatter[k];
  return null;
}

/** Obsidians `parseFrontMatterStringArray`: Liste oder komma-getrennter Text als Strings. */
export function parseFrontMatterStringArray(
  frontmatter: Record<string, unknown> | null | undefined,
  key: string | RegExp,
  nospaces = false,
): string[] | null {
  const raw = parseFrontMatterEntry(frontmatter, key);
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(nospaces ? /[,\s]+/ : /,/) : raw == null ? [] : [raw];
  const result = list
    .filter((v): v is string | number => typeof v === "string" || typeof v === "number")
    .map((v) => String(v).trim())
    .filter(Boolean);
  return result.length ? result : null;
}

/** Obsidians `parseFrontMatterAliases` (`aliases` oder `alias`). */
export function parseFrontMatterAliases(frontmatter: Record<string, unknown> | null | undefined): string[] | null {
  return parseFrontMatterStringArray(frontmatter, /^alias(es)?$/i);
}

function collectFrontmatterLinks(value: unknown, key: string, out: FrontmatterLinkCache[]) {
  if (typeof value === "string") {
    for (const m of value.matchAll(WIKILINK_IN_TEXT)) out.push({ key, original: m[0], ...splitAlias(m[1]) });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => collectFrontmatterLinks(v, `${key}.${i}`, out));
  }
}

/** Interner Markdown-Link? (`[Text](Notiz.md)`, nicht `https://…`, nicht `#anker` allein) */
function internalUrl(url: string): string | null {
  if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url)) return null;
  try {
    return decodeURI(url.replace(/^<|>$/g, ""));
  } catch {
    return url;
  }
}

export function computeMetadata(text: string): CachedMetadata {
  const pos = locator(text);
  const meta: CachedMetadata = {};
  const links: LinkCache[] = [];
  const embeds: EmbedCache[] = [];
  const tags: TagCache[] = [];
  const headings: HeadingCache[] = [];
  const blocks: Record<string, BlockCache> = {};
  const footnotes: FootnoteCache[] = [];

  const tree = obsidianMarkdownParser.parse(text);
  tree.iterate({
    enter: (n) => {
      const source = text.slice(n.from, n.to);
      switch (n.name) {
        case "Frontmatter": {
          meta.frontmatterPosition = pos(n.from, n.to);
          const yaml = source.replace(/^---[^\n]*\n?/, "").replace(/\n?(---|\.\.\.)\s*$/, "");
          try {
            const data = parseYaml(yaml);
            if (data && typeof data === "object" && !Array.isArray(data)) {
              meta.frontmatter = data as Record<string, unknown>;
              const fmLinks: FrontmatterLinkCache[] = [];
              for (const [key, value] of Object.entries(meta.frontmatter)) collectFrontmatterLinks(value, key, fmLinks);
              if (fmLinks.length) meta.frontmatterLinks = fmLinks;
            }
          } catch {
            // Ungültiges YAML: wie Obsidian ohne Frontmatter weiter.
          }
          return false;
        }
        case "Wikilink":
        case "Embed": {
          const inner = source.slice(n.name === "Embed" ? 3 : 2, -2);
          (n.name === "Embed" ? embeds : links).push({ original: source, ...splitAlias(inner), position: pos(n.from, n.to) });
          return false;
        }
        case "Link":
        case "Image": {
          const url = n.node.getChild("URL");
          const marks = n.node.getChildren("LinkMark");
          const link = url ? internalUrl(text.slice(url.from, url.to)) : null;
          if (link !== null && marks.length >= 2) {
            const displayText = text.slice(marks[0].to, marks[1].from);
            (n.name === "Image" ? embeds : links).push({ link, original: source, displayText, position: pos(n.from, n.to) });
          }
          return false;
        }
        case "Tag":
          tags.push({ tag: source, position: pos(n.from, n.to) });
          return false;
        case "FootnoteDefinition": {
          const label = n.node.getChild("FootnoteLabel");
          if (label) footnotes.push({ id: text.slice(label.from, label.to), position: pos(n.from, n.to) });
          // Kein return false: Definitionen können Links und Tags enthalten.
          break;
        }
        case "FencedCode":
        case "CodeBlock":
        case "InlineCode":
        case "InlineMath":
        case "BlockMath":
        case "ObsidianComment":
          return false;
      }
      const heading = /^(?:ATX|Setext)Heading(\d)$/.exec(n.name);
      if (heading) {
        const level = Number(heading[1]);
        const title = n.name.startsWith("ATX")
          ? source.replace(/^#{1,6}[ \t]*/, "").replace(/[ \t]+#+[ \t]*$/, "").trim()
          : source.split("\n")[0].trim();
        headings.push({ heading: title, level, position: pos(n.from, n.to) });
        // Kein return false: Überschriften können Links und Tags enthalten.
      }
      if (n.name === "Paragraph" || n.name === "ListItem" || n.name === "Table" || n.name === "Blockquote") {
        const lastLine = source.slice(source.lastIndexOf("\n") + 1);
        const id = BLOCK_ID.exec(n.name === "ListItem" ? source.split("\n")[0] : lastLine)?.[1];
        if (id && !blocks[id]) blocks[id] = { id, position: pos(n.from, n.to) };
      }
    },
  });

  if (links.length) meta.links = links;
  if (embeds.length) meta.embeds = embeds;
  if (tags.length) meta.tags = tags;
  if (headings.length) meta.headings = headings;
  if (Object.keys(blocks).length) meta.blocks = blocks;
  if (footnotes.length) meta.footnotes = footnotes;
  return meta;
}

/** Alle Tags einer Notiz (Text und Frontmatter), wie Obsidians `getAllTags`. */
export function getAllTags(meta: CachedMetadata): string[] {
  return [...frontmatterTags(meta.frontmatter), ...(meta.tags ?? []).map((t) => t.tag)];
}
