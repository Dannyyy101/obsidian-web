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
- Zu Beginn einer Stufe wird je Feature ein Issue angelegt und hier verlinkt.

---

## 2. Release-Plan

Die Reihenfolge richtet sich nach dem Nutzen im Alltag. Jede Stufe ist für sich nutzbar.
Aufwand ist grob geschätzt (S = Tage, M = ein bis zwei Wochen, L = mehrere Wochen).

| Stufe | Version | Inhalt | Aufwand | Warum jetzt |
|---|---|---|---|---|
| **A – Fundament** | 0.2 | Manuelle Abnahme aller bisherigen Features, fehlende E2E-Tests (Graph, Einstellungen, Embeds, Kontextmenüs, Sync), ESLint mit Schichtgrenzen, Fixture-Vault aus Obsidian Desktop, Wortzählung | M | Bisher ist fast alles nur automatisiert geprüft. Die ersten E2E-Tests haben bereits Fehler gefunden (Firefox-Start, Inline-Titel, CSS-Merge-Fehler). Schichtgrenzen werden mit jeder Zeile Code teurer. |
| **B – Organisieren** | 0.3 | Properties, Tag-Übersicht, Lesezeichen, Tagesnotizen, Vorlagen, Explorer (Drag & Drop, Mehrfachauswahl, Sortierung), Seitenvorschau, erweiterte Suche, HTML in Notizen, Bilder/PDFs im Tab | L | Die meistgenutzten Core-Plugins nach Suche und Backlinks. |
| **C – Anpassen** | 0.4 | Themes und CSS-Snippets, Einstellungsseite für Tastenkürzel, Plugin-Verwaltung, Plugin-API (Views, Post-Processor, Editor-Suggest), Core-Plugins an/aus | L | Öffnet den Weg für Community-Plugins. |
| **D – Plattform** | 0.5 | PWA/Offline, lokale Ordner, ZIP-Import/-Export, Vaults löschen, Mobile (Rest), Safari-Fallback, große Vaults, Dateiwiederherstellung | L | Macht die App unabhängig von einem einzelnen Browser-Profil. |
| **E – Layout und Canvas** | 0.6 | Splits, angeheftete und gestapelte Tabs, Canvas | L | Groß im Aufwand, seltener im Alltag. |

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
| remotely-save als unverändertes Original-Plugin | ✅ | A | 🟡 | WebDAV/S3 direkt; Dropbox/OneDrive über Einstellungs-URI. E2E prüft nur das Laden, nicht den Sync |
| CORS-Proxy für Plugin-Requests | ✅ | | | Dev-Server und Produktionsserver (`server/prod.ts`, optionale Host-Allowlist) |
| Deployment hinter Anmeldung | ✅ | | | `Dockerfile`, `deploy/docker-compose.yml` mit oauth2-proxy und Zitadel |
| Lokale Ordner über File System Access (Chromium) | ⬜ | D | | |
| Vault als ZIP importieren und exportieren | ⬜ | D | | |
| Vaults löschen | ⬜ | D | | |
| Dateiwiederherstellung (Snapshots) | ⬜ | D | | |

### Dateien und Links

| Feature | Status | Stufe | E2E | Anmerkung |
|---|---|---|---|---|
| Datei-Explorer: anlegen, umbenennen, löschen (`.trash`), Kontextmenü | ✅ | A | 🟡 | Plugins können Menüeinträge ergänzen (`file-menu`). E2E ohne Kontextmenü |
| Explorer: Drag & Drop zum Verschieben, Mehrfachauswahl, Sortieroptionen, aktive Datei anzeigen | ⬜ | B | | |
| Linkauflösung wie Obsidian (gleicher Ordner, kürzester Pfad) | ✅ | | ✓ | |
| Links beim Umbenennen/Verschieben anpassen | ✅ | | ✓ | `alwaysUpdateLinks`; hier standardmäßig an, Obsidian fragt nach |
| Index aller Notizen (Links, Embeds, Tags, Überschriften, Blöcke, Frontmatter, Fußnoten) | ✅ | | | Im Web Worker, Cache in IndexedDB |
| Bilder und PDFs als eigene Ansicht im Tab öffnen | ⬜ | B | | |

### Editor

| Feature | Status | Stufe | E2E | Anmerkung |
|---|---|---|---|---|
| Live Preview (Syntax nur am Cursor sichtbar) | ✅ | | ✓ | |
| Quellmodus (`livePreview` in `app.json`) | ✅ | | | |
| Lesemodus (Cmd/Strg+E), Aufgaben dort abhakbar | ✅ | | ✓ | |
| Inline-Titel, Umbenennen über den Titel | ✅ | | ✓ | |
| Speichern nach 2 s, Übernahme von Sync-Änderungen | ✅ | | ✓ | |
| Listen fortsetzen, ein- und ausrücken | 🟡 | | ✓ | `useTab`, `tabSize`, `smartIndentList`. Beim Einrücken beginnt eine nummerierte Liste noch nicht neu bei 1 |
| Autovervollständigung für `[[Links]]` und `#Tags` | 🟡 | | ✓ | Dateien, Aliasse, `#Überschrift`, `#^Block`. Es fehlen `[[##` (vaultweit), nicht verlinkte Ziele und Tags im Frontmatter |
| Klammern und Markdown-Zeichen automatisch schließen | ✅ | | ✓ | `autoPairBrackets`, `autoPairMarkdown` |
| Bilder und Dateien einfügen/ablegen | ✅ | | ✓ | Ablage nach `attachmentFolderPath`, `useMarkdownLinks` wird beachtet |
| Syntax-Highlighting in Codeblöcken, Kopieren-Knopf | ✅ | | ✓ | `@codemirror/language-data`, im Lesemodus Prism-Klassen |
| Überschriften und Listen einklappen | 🟡 | | ✓ | `foldHeading`, `foldIndent`, Zustand im `localStorage`. Im Lesemodus noch nicht |
| Suchen & Ersetzen in der Notiz | ✅ | | ✓ | Groß-/Kleinschreibung, reguläre Ausdrücke, Trefferzähler |
| Kontextmenü, Formatierungsbefehle | ✅ | | ✓ | Befehls-IDs wie Obsidian, Untermenüs, Event `editor-menu` |
| Vim-Modus | 🟡 | | ✓ | `vimMode`, `:w`, `:q`, `:wq`. Ohne `.obsidian.vimrc` |
| Tabellen-Editor in der Live Preview | ✅ | | ✓ | Ändert beim Tippen nur die Zelle in der Quelle |
| Wortzählung in der Statusleiste | ⬜ | A | | |
| Typografie wie Obsidian, `appearance.json` (Schriften, Größe, Theme) | ✅ | | | |

### Markdown-Syntax (Live Preview, Lesemodus, Embeds)

| Feature | Status | Stufe | E2E | Anmerkung |
|---|---|---|---|---|
| Überschriften, Formatierung, `==Highlight==`, `%%Kommentare%%`, Tags | ✅ | | | |
| Listen mit hängendem Einzug, Aufgaben mit Checkbox | ✅ | | ✓ | |
| Links, Wikilinks mit Abschnitt/Alias, fehlende Ziele erkennbar | ✅ | | ✓ | |
| Embeds: Notizen, Abschnitte, Blöcke, Bilder, Audio, Video, PDF | ✅ | A | 🟡 | E2E nur für eingefügte Bilder |
| Callouts mit Typen, Icons, Einklappen, Verschachtelung | ✅ | | ✓ | |
| Tabellen, Codeblöcke, Trennlinien | ✅ | | ✓ | |
| Fußnoten (`[^1]`, `^[inline]`) | ✅ | | ✓ | |
| LaTeX (KaTeX + mhchem), Mermaid | ✅ | | | |
| Frontmatter / Properties-Ansicht und -Bearbeitung | 🟡 | B | | Erscheint nur als Text; Ansicht mit Typen (`types.json`) fehlt |
| HTML in Notizen | 🟡 | B | | Erscheint als Text; zum Rendern braucht es einen Sanitizer |

### Navigation und Arbeitsbereich

| Feature | Status | Stufe | E2E | Anmerkung |
|---|---|---|---|---|
| Tabs mit eigenem Editor, Drag & Drop, Wiederherstellung | ✅ | | ✓ | Kürzel mit Alt, weil Browser Cmd+T/W blockieren |
| Splits, angeheftete und gestapelte Tabs, Pop-out-Fenster | ⬜ | E | | |
| Schnellwechsler (Cmd/Strg+O), Befehlspalette (Cmd/Strg+P) | ✅ | | ✓ | |
| Suche (Cmd/Strg+Shift+F) mit `"Phrase"`, `-`, `file:`, `path:`, `tag:` | 🟡 | B | ✓ | Es fehlen `OR`, reguläre Ausdrücke, `line:`, `block:`, `section:`, Groß-/Kleinschreibung, Sortierung, Suchen & Ersetzen |
| Backlinks inkl. nicht verlinkter Erwähnungen und „Verlinken“ | ✅ | | ✓ | |
| Ausgehende Links, Gliederung | ✅ | | | |
| Graph-Ansicht (global, als Tab) und lokaler Graph | ✅ | A | | Einstellungen in `graph.json` |
| Seitenleisten links/rechts mit Reitern | ✅ | | ✓ | |
| Tag-Übersicht | ⬜ | B | | |
| Lesezeichen (`bookmarks.json`) | ⬜ | B | | |
| Tagesnotizen | ⬜ | B | | |
| Vorlagen | ⬜ | B | | |
| Seitenvorschau beim Hovern über Links | ⬜ | B | | |
| Canvas (JSON Canvas) | ⬜ | E | | |

### Einstellungen und Anpassung

| Feature | Status | Stufe | E2E | Anmerkung |
|---|---|---|---|---|
| Einstellungen: Editor, Dateien & Links, Darstellung | 🟡 | A | | Dateien & Anhänge unvollständig |
| Tastenkürzel aus `hotkeys.json` | 🟡 | C | | Eigene Kürzel gelten, die Einstellungsseite fehlt. Vom Browser belegte Kürzel (Cmd/Strg+T, +W, +N) kommen nicht an |
| Core-Plugins an/aus | ⬜ | C | | |
| Community-Themes und CSS-Snippets | ⬜ | C | | Aus `.obsidian/themes` und `snippets` |
| Community-Plugins installieren, aktivieren, deaktivieren | ⬜ | C | | |
| Oberfläche in weiteren Sprachen | ⬜ | | | Backlog; derzeit nur Deutsch |

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
| `registerView`, `registerMarkdownPostProcessor`, `registerEditorSuggest` | ⬜ | C | | Leere Stubs |
| `Workspace` mit Splits und Seitenleisten-Leaves | ⬜ | E | | Hängt an den Splits |
| Omnisearch als unverändertes Original-Plugin | 🟡 | | ✓ | Index in IndexedDB. Ohne HTTP-API (braucht Node) und Text-Extractor (PDF/Bilder) |
| Latex Suite als unverändertes Original-Plugin | 🟡 | | ✓ | Snippets lösen auch in Code aus, weil das Plugin Codeblöcke an Obsidians internen Knotennamen erkennt |

### Plattform

| Feature | Status | Stufe | E2E | Anmerkung |
|---|---|---|---|---|
| Mobiles Layout | 🟡 | D | ✓ | Seitenleisten als Schubladen, größere Tap-Ziele, Bildschirmtastatur verdeckt den Editor nicht, `body.is-phone`. Es fehlen Wischgesten und eine Editor-Werkzeugleiste |
| PWA / Offline-Betrieb | ⬜ | D | | Service Worker, auch für `getResourcePath` |
| Safari vor 18.2 | ⬜ | D | | Dort fehlt `createWritable`, Schreiben ist nicht möglich |
| Große Vaults: virtualisierte Listen in Explorer und Suche | ⬜ | D | | |

### Qualität und technische Schulden

| Feature | Status | Stufe | E2E | Anmerkung |
|---|---|---|---|---|
| CI (Typecheck, Tests, Build, E2E bei jedem Push und PR) | ✅ | | | |
| E2E-Tests mit Playwright in Chromium, Firefox, WebKit | 🟡 | A | | Es fehlen Graph, Einstellungen, Embeds, Kontextmenüs und Sync |
| ESLint mit Schichtgrenzen (laut Konzept) | ⬜ | A | | |
| Fixture-Vault aus Obsidian Desktop für Kompatibilitätstests | ⬜ | A | | `e2e/fixtures/vault/` ist von Hand geschrieben |
| Manuelle Abnahme in Chrome, Firefox und Safari | ⬜ | A | | Danach als Release-Gate je Stufe |

### Bewusst nicht geplant

| Feature | Grund |
|---|---|
| Obsidian Sync und Publish | 🚫 Proprietäre Dienste; Sync läuft über remotely-save |
| Plugins mit `isDesktopOnly` oder Node/Electron-APIs | 🚫 Im Browser nicht ausführbar |
