import { markdownLanguage } from "@codemirror/lang-markdown";
import * as codemirrorLanguage from "@codemirror/language";
import { ensureSyntaxTree, language, syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { IterMode, NodeType, Tree } from "@lezer/common";

/**
 * Obsidian parst Markdown mit HyperMD und liefert Plugins über `syntaxTree` einen flachen Baum:
 * Unter dem Dokument liegen nur Tokens, deren Namen die CSS-Klassen von HyperMD sind, mit `_`
 * verbunden. Plugins wie Latex Suite erkennen Code an diesen Namen. Unser Editor nutzt den
 * Lezer-Baum von `@codemirror/lang-markdown`, deshalb bekommen Plugins eine Übersetzung.
 *
 * Bisher übersetzt sind Codeblöcke und Inline-Code. Was fehlt, liegt nicht im Baum.
 */
const NAMES = {
  codeblockBegin: "HyperMD-codeblock_HyperMD-codeblock-begin_HyperMD-codeblock-begin-bg_HyperMD-codeblock-bg",
  codeblockLine: "HyperMD-codeblock_HyperMD-codeblock-bg",
  codeblockEnd: "HyperMD-codeblock_HyperMD-codeblock-bg_HyperMD-codeblock-end_HyperMD-codeblock-end-bg",
  inlineCodeMark: "formatting_formatting-code_inline-code",
  inlineCode: "inline-code",
};

type TokenName = keyof typeof NAMES;

const documentType = NodeType.define({ id: 0, name: "Document", top: true });
const tokenTypes = Object.fromEntries(
  Object.entries(NAMES).map(([key, name], i) => [key, NodeType.define({ id: i + 1, name })]),
) as Record<TokenName, NodeType>;

const cache = new WeakMap<Tree, Tree>();

function isEditorMarkdown(state: EditorState): boolean {
  // `markdown()` legt mit Erweiterungen eine eigene Sprache an, teilt aber die Daten-Facette.
  return state.facet(language)?.data === markdownLanguage.data;
}

/** Übersetzt den Lezer-Baum des Editors in einen flachen Baum mit HyperMD-Tokens. */
export function hyperMDTree(state: EditorState, tree: Tree): Tree {
  const cached = cache.get(tree);
  if (cached) return cached;
  const doc = state.doc;
  const children: Tree[] = [];
  const positions: number[] = [];
  const token = (name: TokenName, from: number, to: number) => {
    if (to <= from) return;
    children.push(new Tree(tokenTypes[name], [], [], to - from));
    positions.push(from);
  };
  tree.iterate({
    mode: IterMode.IgnoreMounts,
    enter: (node) => {
      if (node.name === "FencedCode") {
        const begin = doc.lineAt(node.from);
        token("codeblockBegin", node.from, begin.to);
        const last = node.node.lastChild;
        const close = last && last.name === "CodeMark" && last.from > begin.to ? last : null;
        const bodyEnd = close ? doc.lineAt(close.from).number : doc.lineAt(node.to).number + 1;
        for (let n = begin.number + 1; n < bodyEnd; n++) {
          const line = doc.line(n);
          token("codeblockLine", line.from, line.to);
        }
        if (close) token("codeblockEnd", close.from, close.to);
        return false;
      }
      if (node.name === "InlineCode") {
        const open = node.node.firstChild;
        const close = node.node.lastChild;
        if (!open || !close || open.from === close.from) return false;
        token("inlineCodeMark", open.from, open.to);
        token("inlineCode", open.to, close.from);
        token("inlineCodeMark", close.from, close.to);
        return false;
      }
      return undefined;
    },
  });
  const result = new Tree(documentType, children, positions, tree.length);
  cache.set(tree, result);
  return result;
}

/** `@codemirror/language` für Plugins: `syntaxTree` liefert im Markdown-Editor den HyperMD-Baum. */
export const pluginLanguageModule = {
  ...codemirrorLanguage,
  syntaxTree(state: EditorState): Tree {
    const tree = syntaxTree(state);
    return isEditorMarkdown(state) ? hyperMDTree(state, tree) : tree;
  },
  ensureSyntaxTree(state: EditorState, upto: number, timeout?: number): Tree | null {
    const tree = ensureSyntaxTree(state, upto, timeout);
    return tree && isEditorMarkdown(state) ? hyperMDTree(state, tree) : tree;
  },
};
