import type { EditorState } from "@codemirror/state";
import type { TFile } from "../../core/vault";
import { type FuzzyMatch, fuzzyMatch } from "../../shared/fuzzy";
import { dirname } from "../../shared/path";
import { highlight } from "../../ui/quick-switcher";
import { EditorSuggest, type EditorSuggestContext, type EditorSuggestTriggerInfo, isSuggestBlocked } from "./editor-suggest";

export type LinkSuggestion =
  | { type: "file"; file: TFile; alias?: string; match: FuzzyMatch | null }
  | { type: "heading"; path: string; heading: string; level: number; match: FuzzyMatch | null }
  | { type: "block"; path: string; id: string; text: string; match: FuzzyMatch | null };

/** `[[` bzw. `![[` vor dem Cursor, noch ohne `|` (hinter dem Alias gibt es keine Vorschläge). */
const LINK_START = /\[\[([^[\]|\n]*)$/;

/** Zeichen, die Obsidian beim Verlinken aus Überschriften entfernt. */
function headingLinktext(heading: string): string {
  return heading.replace(/[#|^:[\]%]/g, " ").replace(/\s+/g, " ").trim();
}

/** Text eines Blocks ohne Block-ID, Listenmarker und Zitatzeichen, für die Vorschau. */
function blockPreview(text: string): string {
  return text
    .replace(/\s*\^[A-Za-z0-9-]+\s*$/, "")
    .replace(/^\s*(?:>\s*)*(?:[-*+]|\d+[.)])?\s*(?:\[.\]\s*)?/, "")
    .trim();
}

/**
 * Vorschläge für `[[Links]]` und `![[Embeds]]` wie in Obsidian: Dateien und Aliasse, nach `#`
 * Überschriften und nach `#^` Blöcke der Zieldatei (ohne Ziel: der aktuellen Notiz).
 */
export class LinkSuggest extends EditorSuggest<LinkSuggestion> {
  override limit = 50;

  onTrigger(cursor: number, state: EditorState): EditorSuggestTriggerInfo | null {
    const line = state.doc.lineAt(cursor);
    const m = LINK_START.exec(line.text.slice(0, cursor - line.from));
    if (!m || isSuggestBlocked(state, cursor)) return null;
    return { start: cursor - m[1].length, end: cursor, query: m[1] };
  }

  getSuggestions(ctx: EditorSuggestContext): LinkSuggestion[] | Promise<LinkSuggestion[]> {
    const hash = ctx.query.indexOf("#");
    if (hash < 0) return this.fileSuggestions(ctx.query);
    const path = ctx.query.slice(0, hash);
    const subpath = ctx.query.slice(hash + 1);
    const target = path ? this.app.metadataCache.getFirstLinkpathDest(path, ctx.file?.path ?? "") : ctx.file;
    if (!target || target.extension !== "md") return [];
    const meta = this.app.metadataCache.getFileCache(target);
    if (subpath.startsWith("^")) {
      const query = subpath.slice(1);
      const blocks = Object.values(meta?.blocks ?? {});
      if (!blocks.length) return [];
      const suggestions = (text: string) =>
        ranked(
          blocks.map((block) => {
            const preview = blockPreview(text.slice(block.position.start.offset, block.position.end.offset));
            return { type: "block" as const, path, id: block.id, text: preview, match: fuzzyMatch(query, `${block.id} ${preview}`) };
          }),
          query,
        );
      // Die Positionen im Cache beziehen sich auf den gespeicherten Stand, nicht auf den Editor.
      return this.app.vault.cachedRead(target).then(suggestions);
    }
    return ranked(
      (meta?.headings ?? []).map((h) => ({ type: "heading" as const, path, heading: h.heading, level: h.level, match: fuzzyMatch(subpath, h.heading) })),
      subpath,
    );
  }

  private fileSuggestions(query: string): LinkSuggestion[] {
    const { vault, metadataCache } = this.app;
    const rank = new Map(this.app.getRecentFiles().map((p, i) => [p, i]));
    const files = vault
      .getFiles()
      .sort((a, b) => (rank.get(a.path) ?? Infinity) - (rank.get(b.path) ?? Infinity) || b.stat.mtime - a.stat.mtime);
    if (!query.trim()) return files.slice(0, this.limit).map((file) => ({ type: "file", file, match: null }));
    const results: LinkSuggestion[] = [];
    for (const file of files) {
      // Treffer im Namen zählen mehr als im Ordnerpfad, wie im Schnellwechsler.
      const byName = fuzzyMatch(query, file.extension === "md" ? file.basename : file.name);
      const byPath = byName ? null : fuzzyMatch(query, file.path);
      if (byName) results.push({ type: "file", file, match: { ...byName, score: byName.score + 10 } });
      else if (byPath) results.push({ type: "file", file, match: { score: byPath.score, matches: [] } });
      for (const alias of aliases(metadataCache.getFileCache(file)?.frontmatter)) {
        const match = fuzzyMatch(query, alias);
        if (match) results.push({ type: "file", file, alias, match: { ...match, score: match.score + 10 } });
      }
    }
    return results.sort((a, b) => b.match!.score - a.match!.score);
  }

  renderSuggestion(item: LinkSuggestion, el: HTMLElement): void {
    el.addClass("mod-complex");
    const content = el.createDiv("suggestion-content");
    const title = content.createDiv("suggestion-title");
    if (item.type === "file") {
      const name = item.file.extension === "md" ? item.file.basename : item.file.name;
      highlight(title, item.alias ?? name, item.match?.matches ?? []);
      const note = item.alias ? item.file.path : dirname(item.file.path);
      if (note !== "/") content.createDiv({ cls: "suggestion-note", text: note });
      if (item.alias) el.createDiv({ cls: "suggestion-aux", text: "Alias" });
    } else if (item.type === "heading") {
      highlight(title, item.heading, item.match?.matches ?? []);
      el.createDiv({ cls: "suggestion-aux", text: `H${item.level}` });
    } else {
      title.setText(item.text || `^${item.id}`);
      el.createDiv({ cls: "suggestion-aux", text: `^${item.id}` });
    }
  }

  selectSuggestion(item: LinkSuggestion): void {
    const ctx = this.context;
    if (!ctx) return;
    let linktext: string;
    if (item.type === "file") {
      linktext = this.app.metadataCache.fileToLinktext(item.file, ctx.file?.path ?? "");
      if (item.alias) linktext += `|${item.alias}`;
    } else if (item.type === "heading") {
      linktext = `${item.path}#${headingLinktext(item.heading)}`;
    } else {
      linktext = `${item.path}#^${item.id}`;
    }
    // Schließende Klammern, die schon dastehen, werden übernommen statt verdoppelt.
    const after = ctx.view.state.sliceDoc(ctx.end, ctx.end + 2);
    this.replace(`${linktext}]]`, after === "]]" ? ctx.end + 2 : ctx.end);
  }
}

/** Aliasse aus dem Frontmatter (`aliases` oder `alias`, Liste oder Text) wie `parseFrontMatterAliases`. */
function aliases(frontmatter: Record<string, unknown> | undefined): string[] {
  const raw = frontmatter?.aliases ?? frontmatter?.alias;
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  return list.filter((a): a is string => typeof a === "string").map((a) => a.trim()).filter(Boolean);
}

/** Ohne Anfrage in Dokumentreihenfolge, sonst nur Treffer, beste zuerst. */
function ranked<T extends { match: FuzzyMatch | null }>(items: T[], query: string): T[] {
  if (!query.trim()) return items;
  return items.filter((i) => i.match).sort((a, b) => b.match!.score - a.match!.score);
}
