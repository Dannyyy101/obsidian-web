import type { EditorState } from "@codemirror/state";
import { type FuzzyMatch, fuzzyMatch } from "../../shared/fuzzy";
import { highlight } from "../../ui/quick-switcher";
import { EditorSuggest, type EditorSuggestContext, type EditorSuggestTriggerInfo, isSuggestBlocked } from "./editor-suggest";

export interface TagSuggestion {
  /** Tag ohne `#`. */
  tag: string;
  count: number;
  match: FuzzyMatch | null;
}

/** `#` am Wortanfang, gefolgt von Zeichen, die in Tags erlaubt sind. */
const TAG_START = /(?:^|\s)#([\p{L}\p{N}_/-]*)$/u;
const TAG_CHARS = /^[\p{L}\p{N}_/-]*/u;

/** Vorschläge für `#Tags` aus allen Notizen, häufige zuerst. */
export class TagSuggest extends EditorSuggest<TagSuggestion> {
  override limit = 50;

  onTrigger(cursor: number, state: EditorState): EditorSuggestTriggerInfo | null {
    const line = state.doc.lineAt(cursor);
    const m = TAG_START.exec(line.text.slice(0, cursor - line.from));
    // Im Frontmatter stehen Tags ohne `#`; dort gibt es (noch) keine Vorschläge.
    if (!m || isSuggestBlocked(state, cursor, ["Frontmatter"])) return null;
    return { start: cursor - m[1].length, end: cursor, query: m[1] };
  }

  getSuggestions(ctx: EditorSuggestContext): TagSuggestion[] {
    const tags = Object.entries(this.app.metadataCache.getTags()).map(([tag, count]) => ({
      tag: tag.slice(1),
      count,
      match: fuzzyMatch(ctx.query, tag.slice(1)),
    }));
    return tags
      .filter((t) => t.match)
      .sort((a, b) => b.match!.score - a.match!.score || b.count - a.count);
  }

  renderSuggestion(item: TagSuggestion, el: HTMLElement): void {
    el.addClass("mod-complex");
    highlight(el.createDiv("suggestion-content").createDiv("suggestion-title"), item.tag, item.match?.matches ?? []);
    el.createDiv({ cls: "suggestion-aux", text: String(item.count) });
  }

  selectSuggestion(item: TagSuggestion): void {
    const ctx = this.context;
    if (!ctx) return;
    // Den Rest eines angefangenen Tags hinter dem Cursor mit ersetzen.
    const { state } = ctx.view;
    const rest = TAG_CHARS.exec(state.sliceDoc(ctx.end, state.doc.lineAt(ctx.end).to))![0];
    const next = state.sliceDoc(ctx.end + rest.length, ctx.end + rest.length + 1);
    this.replace(next && /\s/.test(next) ? item.tag : `${item.tag} `, ctx.end + rest.length);
  }
}
