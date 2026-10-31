import { GFM, parser as baseParser, type MarkdownConfig } from "@lezer/markdown";
import { Comment } from "./comment/lezer";
import { Footnote } from "./footnote/lezer";
import { Frontmatter } from "./frontmatter/lezer";
import { Highlight } from "./highlight/lezer";
import { Math } from "./math/lezer";
import { Tag } from "./tag/lezer";
import { Wikilink } from "./wikilink/lezer";

/** Obsidian-Syntax für den Editor-Parser (zusätzlich zu CommonMark + GFM). */
export const obsidianLezerExtensions: MarkdownConfig[] = [Frontmatter, Math, Wikilink, Highlight, Tag, Comment, Footnote];

/** Vollständiger Parser (CommonMark + GFM + Obsidian), z. B. für das Rendern von Tabellenzellen. */
export const obsidianMarkdownParser = baseParser.configure([GFM, ...obsidianLezerExtensions]);
