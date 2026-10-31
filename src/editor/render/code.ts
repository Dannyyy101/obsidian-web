import { HighlightStyle, LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { highlightCode, type Tag, tagHighlighter, tags as t } from "@lezer/highlight";

/** Token-Arten wie in Prism (Obsidians Lesemodus); Farben über `--code-*`-Variablen. */
const TOKENS: [Tag | Tag[], string][] = [
  [[t.keyword, t.controlKeyword, t.moduleKeyword, t.definitionKeyword, t.operatorKeyword, t.modifier, t.self], "keyword"],
  [[t.string, t.special(t.string), t.docString], "string"],
  [t.regexp, "regex"],
  [[t.comment, t.lineComment, t.blockComment, t.docComment], "comment"],
  [[t.number, t.integer, t.float, t.unit], "number"],
  [[t.bool, t.null, t.atom], "boolean"],
  [[t.function(t.variableName), t.function(t.definition(t.variableName)), t.function(t.propertyName)], "function"],
  [[t.className, t.typeName, t.namespace], "class-name"],
  [[t.operator, t.derefOperator, t.arithmeticOperator, t.logicOperator, t.compareOperator, t.definitionOperator, t.updateOperator, t.bitwiseOperator, t.typeOperator], "operator"],
  [[t.punctuation, t.separator, t.bracket, t.paren, t.squareBracket, t.brace, t.angleBracket], "punctuation"],
  [[t.propertyName, t.definition(t.propertyName)], "property"],
  [t.tagName, "tag"],
  [t.attributeName, "attr-name"],
  [t.attributeValue, "attr-value"],
  [t.standard(t.variableName), "builtin"],
  [t.definition(t.variableName), "variable"],
  [t.annotation, "important"],
];

/** Lesemodus: `<span class="token keyword">` wie Prism, damit Themes greifen. */
const prismHighlighter = tagHighlighter(TOKENS.map(([tag, name]) => ({ tag, class: `token ${name}` })));

/**
 * Editor: Klassen `cm-keyword`, `cm-string` … wie in Obsidians Codeblöcken. Gefärbt werden sie per
 * CSS nur in Codeblock-Zeilen, damit z. B. der Linktitel (`string`) im Fließtext normal bleibt.
 */
export const codeHighlightStyle = HighlightStyle.define(TOKENS.map(([tag, name]) => ({ tag, class: `cm-${name}` })));

/** Sprachen für Codeblöcke (werden beim ersten Gebrauch nachgeladen). */
export const codeLanguages = languages;

export function findLanguage(name: string): LanguageDescription | null {
  return name ? LanguageDescription.matchLanguageName(languages, name, true) : null;
}

/**
 * Hebt den Code in `codeEl` hervor, sobald die Sprache geladen ist. Bis dahin (oder bei unbekannter
 * Sprache) bleibt der Klartext stehen.
 */
export async function highlightCodeElement(code: string, lang: string, codeEl: HTMLElement): Promise<void> {
  const description = findLanguage(lang);
  if (!description) return;
  const support = description.support ?? (await description.load().catch(() => null));
  if (!support) return;
  const tree = support.language.parser.parse(code);
  const fragment = document.createDocumentFragment();
  highlightCode(
    code,
    tree,
    prismHighlighter,
    (text, classes) => {
      if (classes) fragment.appendChild(createSpan({ cls: classes.split(" "), text }));
      else fragment.appendChild(document.createTextNode(text));
    },
    () => fragment.appendChild(document.createTextNode("\n")),
  );
  codeEl.empty();
  codeEl.appendChild(fragment);
  codeEl.addClass("is-loaded");
}

/** Kopiert den Codeblock und zeigt kurz „Kopiert!“ an. */
export function copyCode(code: string, button: HTMLElement, label: string): void {
  void navigator.clipboard?.writeText(code).then(() => {
    button.setText("Kopiert!");
    button.addClass("mod-copied");
    window.setTimeout(() => {
      button.setText(label);
      button.removeClass("mod-copied");
    }, 1500);
  });
}
