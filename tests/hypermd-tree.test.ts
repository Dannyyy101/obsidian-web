import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { StreamLanguage, syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { pluginLanguageModule } from "../src/api/hypermd-tree";
import { obsidianLezerExtensions } from "../src/markdown/syntax";

function stateOf(doc: string) {
  return EditorState.create({ doc, extensions: markdown({ base: markdownLanguage, extensions: obsidianLezerExtensions }) });
}

/** Tokens unter dem Dokument als `[Name, Text]`. */
function tokens(doc: string) {
  const state = stateOf(doc);
  const result: [string, string][] = [];
  for (let node = pluginLanguageModule.syntaxTree(state).topNode.firstChild; node; node = node.nextSibling) {
    result.push([node.name, state.sliceDoc(node.from, node.to)]);
  }
  return result;
}

const BEGIN = "HyperMD-codeblock_HyperMD-codeblock-begin_HyperMD-codeblock-begin-bg_HyperMD-codeblock-bg";
const LINE = "HyperMD-codeblock_HyperMD-codeblock-bg";
const END = "HyperMD-codeblock_HyperMD-codeblock-bg_HyperMD-codeblock-end_HyperMD-codeblock-end-bg";
const MARK = "formatting_formatting-code_inline-code";

describe("HyperMD-Baum für Plugins", () => {
  it("übersetzt Codeblöcke zeilenweise", () => {
    expect(tokens("Text\n```python\nx = 1\n\ny = 2\n```\nmehr")).toEqual([
      [BEGIN, "```python"],
      [LINE, "x = 1"],
      [LINE, "y = 2"],
      [END, "```"],
    ]);
  });

  it("lässt bei offenem Codeblock das Ende weg", () => {
    expect(tokens("~~~\na\nb")).toEqual([
      [BEGIN, "~~~"],
      [LINE, "a"],
      [LINE, "b"],
    ]);
  });

  it("übersetzt Inline-Code samt Backticks", () => {
    expect(tokens("a `b` und ``c`` d")).toEqual([
      [MARK, "`"],
      ["inline-code", "b"],
      [MARK, "`"],
      [MARK, "``"],
      ["inline-code", "c"],
      [MARK, "``"],
    ]);
  });

  it("findet Code mit resolveInner wie Latex Suite", () => {
    const state = stateOf("a `code` b");
    const tree = pluginLanguageModule.syntaxTree(state);
    expect(tree.resolveInner(5, -1).name).toContain("inline-code");
    expect(tree.resolveInner(1, -1).name).toBe("Document");
  });

  it("lässt andere Sprachen und den Baum des Editors unverändert", () => {
    const plain = StreamLanguage.define({ token: (stream) => {
        stream.skipToEnd();
        return null;
      },
    });
    const other = EditorState.create({ doc: "`a`", extensions: plain });
    expect(pluginLanguageModule.syntaxTree(other)).toBe(syntaxTree(other));
    const md = stateOf("`a`");
    expect(syntaxTree(md).topNode.firstChild?.name).toBe("Paragraph");
    expect(pluginLanguageModule.syntaxTree(md)).toBe(pluginLanguageModule.syntaxTree(md));
  });
});
