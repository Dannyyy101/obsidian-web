# obsidian-web – Roadmap

Stand: 2026-11-01 · Version 0.1.0

Ziel ist eine vollständige Abbildung von Obsidian im Browser (siehe `docs/KONZEPT.md`). Diese Datei
hat zwei Teile: den **Release-Plan** (was als Nächstes kommt und wann es fertig ist) und die
**Feature-Matrix** (was es gibt, mit genau einer Zeile pro Feature).

---

## 1. Spielregeln

### Status

| Zeichen | Bedeutung |
|---|---|
| ✅ | Umgesetzt und durch Unit-Tests abgedeckt |
| 🟡 | Teilweise umgesetzt; was fehlt, steht in der Anmerkung |
| ⬜ | Fehlt |
| 🚫 | Bewusst nicht geplant |

Die Spalte **E2E** zeigt, ob ein Playwright-Test in Chromium, Firefox und WebKit das Feature im
echten Browser prüft (`e2e/`). Ein ✅ ohne E2E ist nur in happy-dom getestet.

### Definition of Done für ein Feature

1. Verhalten wie Obsidian (Clean-Room, siehe `docs/KONZEPT.md`), Einstellungen aus denselben
   `.obsidian/*.json`-Schlüsseln.
2. Unit-Tests für die Logik, ein E2E-Test für den sichtbaren Kernablauf.
3. CI grün (Typecheck, Unit-Tests, Build, E2E).
4. Diese Datei im selben PR aktualisiert: Status, Anmerkung, E2E-Spalte.

### Release-Gate

Ein Release (Stufe abgeschlossen → Version erhöhen) setzt voraus:

- Alle Features der Stufe erfüllen die Definition of Done.
- Manuelle Abnahme der Features dieser Stufe in Chrome, Firefox und Safari (Checkliste im PR).
- Keine offenen Fehler, die Datenverlust im Vault verursachen können.

### Pflege

- Jedes Feature steht genau einmal in der Matrix. Lücken stehen in der Anmerkung, nicht in einem
  zweiten Abschnitt.
- Jedes offene Feature hat eine Stufe. Ohne Stufe heißt: Backlog, bewusst zurückgestellt.
- Jedes offene Feature hat ein Issue (Label `roadmap`, `stufe:A`…`E` oder `backlog`, Milestone
  der Version). Neue Features bekommen zuerst ein Issue, dann eine Zeile hier.

---

## 2. Release-Plan

Die Reihenfolge richtet sich nach dem Nutzen im Alltag. Jede Stufe ist für sich nutzbar.
Aufwand ist grob geschätzt (S = Tage, M = ein bis zwei Wochen, L = mehrere Wochen).

| Stufe | Version | Inhalt | Aufwand | Warum jetzt |
|---|---|---|---|---|
| **A – Fundament** | [0.2][mA] | Manuelle Abnahme aller bisherigen Features, fehlende E2E-Tests (Graph, Einstellungen, Embeds, Kontextmenüs, Sync), ESLint mit Schichtgrenzen, Fixture-Vault aus Obsidian Desktop, Wortzählung | M | Bisher ist fast alles nur automatisiert geprüft. Die ersten E2E-Tests haben bereits Fehler gefunden (Firefox-Start, Inline-Titel, CSS-Merge-Fehler). Schichtgrenzen werden mit jeder Zeile Code teurer. |
| **B – Organisieren** | [0.3][mB] | Properties, Tag-Übersicht, Lesezeichen, Tagesnotizen, Vorlagen, Explorer (Drag & Drop, Mehrfachauswahl, Sortierung), Seitenvorschau, erweiterte Suche, HTML in Notizen, Bilder/PDFs im Tab | L | Die meistgenutzten Core-Plugins nach Suche und Backlinks. |
| **C – Anpassen** | [0.4][mC] | Themes und CSS-Snippets, Einstellungsseite für Tastenkürzel, Plugin-Verwaltung, Plugin-API (Views, Post-Processor, Editor-Suggest), Core-Plugins an/aus | L | Öffnet den Weg für Community-Plugins. |
| **D – Plattform** | [0.5][mD] | PWA/Offline, lokale Ordner, ZIP-Import/-Export, Vaults löschen, Mobile (Rest), Safari-Fallback, große Vaults, Dateiwiederherstellung | L | Macht die App unabhängig von einem einzelnen Browser-Profil. |
| **E – Layout und Canvas** | [0.6][mE] | Splits, angeheftete und gestapelte Tabs, Canvas | L | Groß im Aufwand, seltener im Alltag. |

Abgeschlossen vor 0.2: Editor-Grundfunktionen (Listen, Autovervollständigung, Auto-Pairing, Anhänge,
Code-Highlighting, Einklappen, Suchen & Ersetzen, Formatierung, Vim, Tabellen, Fußnoten), CI,
E2E-Grundgerüst, Omnisearch, `hotkeys.json`, mobile Schubladen.

---

## 3. Feature-Matrix

### Speicher und Sync

| Feature | Status | Stufe | E2E | Anmerkung |
|---|---|---|---|---|
| Vault im Browser-Speicher (OPFS), mehrere Vaults, Vault-Auswahl | ✅ | | ✓ | |
| Änderungszeiten (`mtime`/`ctime`) dauerhaft in IndexedDB | ✅ | | | Voraussetzung für korrekten Sync |
| Unicode-Schreibweisen (NFC/NFD) | ✅ | | | Behebt den Safari-Fehler bei Umlauten |
| remotely-save als unverändertes Original-Plugin | ✅ | A · [#16] | 🟡 | WebDAV/S3 direkt; Dropbox/OneDrive über Einstellungs-URI. E2E prüft nur das Laden, nicht den Sync |
| CORS-Proxy für Plugin-Requests | ✅ | | | Dev-Server und Produktionsserver (`server/prod.ts`, optionale Host-Allowlist) |
| Deployment hinter Anmeldung | ✅ | | | `Dockerfile`, `deploy/docker-compose.yml` mit oauth2-proxy und Zitadel |
| Lokale Ordner über File System Access (Chromium) | ⬜ | D · [#40] | | |
| Vault als ZIP importieren und exportieren | ⬜ | D · [#41] | | |
| Vaults löschen | ⬜ | D · [#42] | | |
| Dateiwiederherstellung (Snapshots) | ⬜ | D · [#43] | | |

### Dateien und Links

| Feature | Status | Stufe | E2E | Anmerkung |
|---|---|---|---|---|
| Datei-Explorer: anlegen, umbenennen, löschen (`.trash`), Kontextmenü | ✅ | A · [#15] | 🟡 | Plugins können Menüeinträge ergänzen (`file-menu`). E2E ohne Kontextmenü |
| Explorer: Drag & Drop zum Verschieben, Mehrfachauswahl, Sortieroptionen, aktive Datei anzeigen | ⬜ | B · [#26] | | |
| Linkauflösung wie Obsidian (gleicher Ordner, kürzester Pfad) | ✅ | | ✓ | |
| Links beim Umbenennen/Verschieben anpassen | ✅ | | ✓ | `alwaysUpdateLinks`; hier standardmäßig an, Obsidian fragt nach |
| Index aller Notizen (Links, Embeds, Tags, Überschriften, Blöcke, Frontmatter, Fußnoten) | ✅ | | | Im Web Worker, Cache in IndexedDB |
| Bilder und PDFs als eigene Ansicht im Tab öffnen | ⬜ | B · [#30] | | |

### Editor

| Feature | Status | Stufe | E2E | Anmerkung |
|---|---|---|---|---|
| Live Preview (Syntax nur am Cursor sichtbar) | ✅ | | ✓ | |
| Quellmodus (`livePreview` in `app.json`) | ✅ | | | |
| Lesemodus (Cmd/Strg+E), Aufgaben dort abhakbar | ✅ | | ✓ | |
| Inline-Titel, Umbenennen über den Titel | ✅ | | ✓ | |
| Speichern nach 2 s, Übernahme von Sync-Änderungen | ✅ | | ✓ | |
| Listen fortsetzen, ein- und ausrücken | 🟡 | [#47] | ✓ | `useTab`, `tabSize`, `smartIndentList`. Beim Einrücken beginnt eine nummerierte Liste noch nicht neu bei 1 |
| Autovervollständigung für `[[Links]]` und `#Tags` | 🟡 | [#48] | ✓ | Dateien, Aliasse, `#Überschrift`, `#^Block`. Es fehlen `[[##` (vaultweit), nicht verlinkte Ziele und Tags im Frontmatter |
| Klammern und Markdown-Zeichen automatisch schließen | ✅ | | ✓ | `autoPairBrackets`, `autoPairMarkdown` |
| Bilder und Dateien einfügen/ablegen | ✅ | | ✓ | Ablage nach `attachmentFolderPath`, `useMarkdownLinks` wird beachtet |
| Syntax-Highlighting in Codeblöcken, Kopieren-Knopf | ✅ | | ✓ | `@codemirror/language-data`, im Lesemodus Prism-Klassen |
| Überschriften und Listen einklappen | 🟡 | [#49] | ✓ | `foldHeading`, `foldIndent`, Zustand im `localStorage`. Im Lesemodus noch nicht |
| Suchen & Ersetzen in der Notiz | ✅ | | ✓ | Groß-/Kleinschreibung, reguläre Ausdrücke, Trefferzähler |
| Kontextmenü, Formatierungsbefehle | ✅ | | ✓ | Befehls-IDs wie Obsidian, Untermenüs, Event `editor-menu` |
| Vim-Modus | 🟡 | [#50] | ✓ | `vimMode`, `:w`, `:q`, `:wq`. Ohne `.obsidian.vimrc` |
| Tabellen-Editor in der Live Preview | ✅ | | ✓ | Ändert beim Tippen nur die Zelle in der Quelle |
| Wortzählung in der Statusleiste | ✅ | A · [#19] | ✓ | Core-Plugin `word-count`; ohne Frontmatter, Kommentare und Syntax, Auswahl separat. Abschaltbar erst mit [#32] |
| Typografie wie Obsidian, `appearance.json` (Schriften, Größe, Theme) | ✅ | | | |

### Markdown-Syntax (Live Preview, Lesemodus, Embeds)

| Feature | Status | Stufe | E2E | Anmerkung |
|---|---|---|---|---|
| Überschriften, Formatierung, `==Highlight==`, `%%Kommentare%%`, Tags | ✅ | | | |
| Listen mit hängendem Einzug, Aufgaben mit Checkbox | ✅ | | ✓ | |
| Links, Wikilinks mit Abschnitt/Alias, fehlende Ziele erkennbar | ✅ | | ✓ | |
| Embeds: Notizen, Abschnitte, Blöcke, Bilder, Audio, Video, PDF | ✅ | A · [#14] | 🟡 | E2E nur für eingefügte Bilder |
| Callouts mit Typen, Icons, Einklappen, Verschachtelung | ✅ | | ✓ | |
| Tabellen, Codeblöcke, Trennlinien | ✅ | | ✓ | |
| Fußnoten (`[^1]`, `^[inline]`) | ✅ | | ✓ | |
| LaTeX (KaTeX + mhchem), Mermaid | ✅ | | | |
| Frontmatter / Properties-Ansicht und -Bearbeitung | 🟡 | B · [#21] | | Erscheint nur als Text; Ansicht mit Typen (`types.json`) fehlt |
| HTML in Notizen | 🟡 | B · [#29] | | Erscheint als Text; zum Rendern braucht es einen Sanitizer |

### Navigation und Arbeitsbereich

| Feature | Status | Stufe | E2E | Anmerkung |
|---|---|---|---|---|
| Tabs mit eigenem Editor, Drag & Drop, Wiederherstellung | ✅ | | ✓ | Kürzel mit Alt, weil Browser Cmd+T/W blockieren |
| Splits, angeheftete und gestapelte Tabs, Pop-out-Fenster | ⬜ | E · [#44] | | |
| Schnellwechsler (Cmd/Strg+O), Befehlspalette (Cmd/Strg+P) | ✅ | | ✓ | |
| Suche (Cmd/Strg+Shift+F) mit `"Phrase"`, `-`, `file:`, `path:`, `tag:` | 🟡 | B · [#28] | ✓ | Es fehlen `OR`, reguläre Ausdrücke, `line:`, `block:`, `section:`, Groß-/Kleinschreibung, Sortierung, Suchen & Ersetzen |
| Backlinks inkl. nicht verlinkter Erwähnungen und „Verlinken“ | ✅ | | ✓ | |
| Ausgehende Links, Gliederung | ✅ | | | |
| Graph-Ansicht (global, als Tab) und lokaler Graph | ✅ | A · [#12] | | Einstellungen in `graph.json` |
| Seitenleisten links/rechts mit Reitern | ✅ | | ✓ | |
| Tag-Übersicht | ⬜ | B · [#22] | | |
| Lesezeichen (`bookmarks.json`) | ⬜ | B · [#23] | | |
| Tagesnotizen | ⬜ | B · [#24] | | |
| Vorlagen | ⬜ | B · [#25] | | |
| Seitenvorschau beim Hovern über Links | ⬜ | B · [#27] | | |
| Canvas (JSON Canvas) | ⬜ | E · [#46] | | |

### Einstellungen und Anpassung

| Feature | Status | Stufe | E2E | Anmerkung |
|---|---|---|---|---|
| Einstellungen: Editor, Dateien & Links, Darstellung | 🟡 | A · [#13], [#20] | | Dateien & Anhänge unvollständig |
| Tastenkürzel aus `hotkeys.json` | 🟡 | C · [#31] | | Eigene Kürzel gelten, die Einstellungsseite fehlt. Vom Browser belegte Kürzel (Cmd/Strg+T, +W, +N) kommen nicht an |
| Core-Plugins an/aus | ⬜ | C · [#32] | | |
| Community-Themes und CSS-Snippets | ⬜ | C · [#33] | | Aus `.obsidian/themes` und `snippets` |
| Community-Plugins installieren, aktivieren, deaktivieren | ⬜ | C · [#34] | | |
| Oberfläche in weiteren Sprachen | ⬜ | [#51] | | Backlog; derzeit nur Deutsch |

### Plugin-Kompatibilität

| Feature | Status | Stufe | E2E | Anmerkung |
|---|---|---|---|---|
| Modul `obsidian`, Plugin-Loader aus `.obsidian/plugins/` | ✅ | | ✓ | |
| DOM- und JS-Erweiterungen (`createEl`, `Array.first`, `node.win` …) | ✅ | | | |
| `Modal`, `Setting`, `Notice`, `Menu`, `PluginSettingTab`, `requestUrl`, `Platform` | ✅ | | | |
| `registerEditorExtension`, `workspace.updateOptions`, CodeMirror/Lezer per `require` | ✅ | | | Dieselben Instanzen wie im Editor |
| `editorInfoField`, `editorLivePreviewField`, `livePreviewState` | ✅ | | | |
| `Scope`, `app.keymap`, `AbstractInputSuggest`, `MarkdownRenderer`, `sanitizeHTMLToDom`, `renderMath`, `i18next` | ✅ | | | `renderMath` rendert mit KaTeX statt MathJax, `\class` wird zu `\htmlClass` |
| `Editor`-Fassade, `MarkdownView`, `leaf.view`/`getViewState`, `getActiveViewOfType`, `editorCallback` | ✅ | | | |
| `Modal.scope`, `metadataCache.isUserIgnored`, `getAllTags`, `parseFrontMatterAliases`, `getLinkpath` | ✅ | | | |
| `registerView`, `registerMarkdownPostProcessor`, `registerEditorSuggest` | ⬜ | C · [#35] | | Leere Stubs |
| `Workspace` mit Splits und Seitenleisten-Leaves | ⬜ | E · [#45] | | Hängt an den Splits |
| Omnisearch als unverändertes Original-Plugin | 🟡 | | ✓ | Index in IndexedDB. Ohne HTTP-API (braucht Node) und Text-Extractor (PDF/Bilder) |
| Latex Suite als unverändertes Original-Plugin | ✅ | [#52] | ✓ | Erkennt Code an Obsidians HyperMD-Knotennamen. `syntaxTree` liefert Plugins deshalb einen übersetzten Baum, bisher nur mit Codeblöcken und Inline-Code |

### Plattform

| Feature | Status | Stufe | E2E | Anmerkung |
|---|---|---|---|---|
| Mobiles Layout | 🟡 | D · [#36] | ✓ | Seitenleisten als Schubladen, größere Tap-Ziele, Bildschirmtastatur verdeckt den Editor nicht, `body.is-phone`. Es fehlen Wischgesten und eine Editor-Werkzeugleiste |
| PWA / Offline-Betrieb | ⬜ | D · [#37] | | Service Worker, auch für `getResourcePath` |
| Safari vor 18.2 | ⬜ | D · [#38] | | Dort fehlt `createWritable`, Schreiben ist nicht möglich |
| Große Vaults: virtualisierte Listen in Explorer und Suche | ⬜ | D · [#39] | | |

### Qualität und technische Schulden

| Feature | Status | Stufe | E2E | Anmerkung |
|---|---|---|---|---|
| CI (Typecheck, Tests, Build, E2E bei jedem Push und PR) | ✅ | | | |
| E2E-Tests mit Playwright in Chromium, Firefox, WebKit | 🟡 | A · [#12], [#13], [#14], [#15], [#16] | | Es fehlen Graph, Einstellungen, Embeds, Kontextmenüs und Sync |
| ESLint mit Schichtgrenzen (laut Konzept) | ✅ | A · [#17] | | `pnpm lint` in CI und Pre-push-Hook, prüft auch `window`/`document` in den Worker-Schichten |
| Fixture-Vault aus Obsidian Desktop für Kompatibilitätstests | ⬜ | A · [#18] | | `e2e/fixtures/vault/` ist von Hand geschrieben |
| Manuelle Abnahme in Chrome, Firefox und Safari | ⬜ | A · [#11] | | Danach als Release-Gate je Stufe |

### Bewusst nicht geplant

| Feature | Grund |
|---|---|
| Obsidian Sync und Publish | 🚫 Proprietäre Dienste; Sync läuft über remotely-save |
| Plugins mit `isDesktopOnly` oder Node/Electron-APIs | 🚫 Im Browser nicht ausführbar |

[#11]: https://github.com/Dannyyy101/obsidian-web/issues/11
[#12]: https://github.com/Dannyyy101/obsidian-web/issues/12
[#13]: https://github.com/Dannyyy101/obsidian-web/issues/13
[#14]: https://github.com/Dannyyy101/obsidian-web/issues/14
[#15]: https://github.com/Dannyyy101/obsidian-web/issues/15
[#16]: https://github.com/Dannyyy101/obsidian-web/issues/16
[#17]: https://github.com/Dannyyy101/obsidian-web/issues/17
[#18]: https://github.com/Dannyyy101/obsidian-web/issues/18
[#19]: https://github.com/Dannyyy101/obsidian-web/issues/19
[#20]: https://github.com/Dannyyy101/obsidian-web/issues/20
[#21]: https://github.com/Dannyyy101/obsidian-web/issues/21
[#22]: https://github.com/Dannyyy101/obsidian-web/issues/22
[#23]: https://github.com/Dannyyy101/obsidian-web/issues/23
[#24]: https://github.com/Dannyyy101/obsidian-web/issues/24
[#25]: https://github.com/Dannyyy101/obsidian-web/issues/25
[#26]: https://github.com/Dannyyy101/obsidian-web/issues/26
[#27]: https://github.com/Dannyyy101/obsidian-web/issues/27
[#28]: https://github.com/Dannyyy101/obsidian-web/issues/28
[#29]: https://github.com/Dannyyy101/obsidian-web/issues/29
[#30]: https://github.com/Dannyyy101/obsidian-web/issues/30
[#31]: https://github.com/Dannyyy101/obsidian-web/issues/31
[#32]: https://github.com/Dannyyy101/obsidian-web/issues/32
[#33]: https://github.com/Dannyyy101/obsidian-web/issues/33
[#34]: https://github.com/Dannyyy101/obsidian-web/issues/34
[#35]: https://github.com/Dannyyy101/obsidian-web/issues/35
[#36]: https://github.com/Dannyyy101/obsidian-web/issues/36
[#37]: https://github.com/Dannyyy101/obsidian-web/issues/37
[#38]: https://github.com/Dannyyy101/obsidian-web/issues/38
[#39]: https://github.com/Dannyyy101/obsidian-web/issues/39
[#40]: https://github.com/Dannyyy101/obsidian-web/issues/40
[#41]: https://github.com/Dannyyy101/obsidian-web/issues/41
[#42]: https://github.com/Dannyyy101/obsidian-web/issues/42
[#43]: https://github.com/Dannyyy101/obsidian-web/issues/43
[#44]: https://github.com/Dannyyy101/obsidian-web/issues/44
[#45]: https://github.com/Dannyyy101/obsidian-web/issues/45
[#46]: https://github.com/Dannyyy101/obsidian-web/issues/46
[#47]: https://github.com/Dannyyy101/obsidian-web/issues/47
[#48]: https://github.com/Dannyyy101/obsidian-web/issues/48
[#49]: https://github.com/Dannyyy101/obsidian-web/issues/49
[#50]: https://github.com/Dannyyy101/obsidian-web/issues/50
[#51]: https://github.com/Dannyyy101/obsidian-web/issues/51
[#52]: https://github.com/Dannyyy101/obsidian-web/issues/52
[mA]: https://github.com/Dannyyy101/obsidian-web/milestone/1
[mB]: https://github.com/Dannyyy101/obsidian-web/milestone/2
[mC]: https://github.com/Dannyyy101/obsidian-web/milestone/3
[mD]: https://github.com/Dannyyy101/obsidian-web/milestone/4
[mE]: https://github.com/Dannyyy101/obsidian-web/milestone/5
