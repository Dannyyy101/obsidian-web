# 0001 – HyperMD-Syntaxbaum für Plugins

Status: angenommen (2026-11-01, [#52](https://github.com/Dannyyy101/obsidian-web/issues/52))

## Kontext

Obsidian parst Markdown im Editor mit HyperMD. `syntaxTree(state)` liefert dort einen flachen Baum:
Unter dem Dokument liegen nur Tokens, deren Namen die CSS-Klassen von HyperMD sind, mit `_`
verbunden (`HyperMD-codeblock_HyperMD-codeblock-bg`, `formatting_formatting-code_inline-code`).
Plugins lesen diese Namen. Latex Suite erkennt so Codeblöcke und Inline-Code.

Unser Editor nutzt `@codemirror/lang-markdown` mit Lezer-Erweiterungen. Dieser Baum ist
verschachtelt und heißt anders (`FencedCode`, `InlineCode`). Live Preview, Faltung, Listen und
Vorschläge bauen darauf auf, und es gibt nur einen Parser für alles (KONZEPT 3.3).

## Entscheidung

Der Editor behält den Lezer-Baum. Plugins bekommen über `require("@codemirror/language")` ein
Modul, dessen `syntaxTree` und `ensureSyntaxTree` im Markdown-Editor einen übersetzten, flachen
Baum mit HyperMD-Namen liefern (`src/api/hypermd-tree.ts`). Für andere Sprachen, etwa den
Snippet-Editor von Latex Suite, bleibt der Baum unverändert. Die Übersetzung wird pro Lezer-Baum
zwischengespeichert.

Übersetzt wird nur, was ein Plugin nachweislich braucht: zunächst Codeblöcke und Inline-Code.
Weitere Tokens (Überschriften, Formeln, Links …) kommen dazu, sobald ein Plugin sie liest.

## Folgen

- Plugins sehen Obsidians Namen, ohne dass sich der Parser oder unser eigener Code ändert.
- Der übersetzte Baum ist unvollständig. Ein Plugin, das ein fehlendes Token sucht, findet es nicht
  und verhält sich wie außerhalb davon.
- Die Namen sind nicht dokumentiert. Grundlage sind die Namen, die Plugins im Quellcode abfragen.
