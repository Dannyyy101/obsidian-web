# obsidian-web – Roadmap

Stand: 2026-10-31 · Grundlage: Code im Repository (Typecheck grün, 131 Unit-Tests und 17 E2E-Tests in Chromium, Firefox und WebKit grün)

Ziel ist eine vollständige Abbildung von Obsidian im Browser (siehe `docs/KONZEPT.md`). Diese Datei
zeigt, was davon umgesetzt ist, was nur teilweise geht und was fehlt, und schlägt eine Reihenfolge
für den Rest vor.

**Legende:** ✅ umgesetzt · 🟡 teilweise · ⬜ fehlt · 🚫 bewusst nicht geplant

> **Hinweis zur Prüfung:** „Umgesetzt“ heißt: durch automatisierte Tests abgedeckt (Vitest,
> happy-dom). Die Kernabläufe (Vault anlegen und öffnen, Speichern, Umbenennen mit Link-Update,
> Live Preview, Lesemodus, Schnellwechsler, Befehlspalette, Suche, Backlinks, Tabs, remotely-save
> laden) prüfen zusätzlich E2E-Tests mit Playwright in Chromium, Firefox und WebKit (`e2e/`). Eine
> manuelle Abnahme aller Features steht noch aus.

---

## 1. Was bereits funktioniert

### Speicher und Sync

| Feature | Status | Anmerkung |
|---|---|---|
| Vault im Browser-Speicher (OPFS), mehrere Vaults, Vault-Auswahl | ✅ | |
| Änderungszeiten (`mtime`/`ctime`) dauerhaft in IndexedDB | ✅ | Voraussetzung für korrekten Sync |
| Unicode-Schreibweisen (NFC/NFD) | ✅ | Behebt den Safari-Fehler bei Umlauten |
| remotely-save als unverändertes Original-Plugin | ✅ | WebDAV/S3 direkt; Dropbox/OneDrive über Einstellungs-URI aus Desktop/Mobile |
| CORS-Proxy für Plugin-Requests | ✅ | Dev-Server und Produktionsserver (`server/prod.ts`, optionale Host-Allowlist) |
| Deployment hinter Anmeldung | ✅ | `Dockerfile`, `deploy/docker-compose.yml` mit oauth2-proxy und Zitadel |

### Dateien und Links

| Feature | Status | Anmerkung |
|---|---|---|
| Datei-Explorer: anlegen, umbenennen, löschen (`.trash`), Kontextmenü | ✅ | Plugins können Menüeinträge ergänzen (`file-menu`) |
| Linkauflösung wie Obsidian (gleicher Ordner, kürzester Pfad) | ✅ | |
| Links beim Umbenennen/Verschieben anpassen | ✅ | `alwaysUpdateLinks`; hier standardmäßig an, Obsidian fragt nach |
| Index aller Notizen (Links, Embeds, Tags, Überschriften, Blöcke, Frontmatter) | ✅ | Im Web Worker, Cache in IndexedDB |

### Editor

| Feature | Status | Anmerkung |
|---|---|---|
| Live Preview (Syntax nur am Cursor sichtbar) | ✅ | |
| Quellmodus (`livePreview` in `app.json`) | ✅ | |
| Lesemodus (Cmd/Strg+E), Aufgaben dort abhakbar | ✅ | |
| Inline-Titel, Umbenennen über den Titel | ✅ | |
| Speichern nach 2 s, Übernahme von Sync-Änderungen | ✅ | |
| Typografie wie Obsidian, `appearance.json` (Schriften, Größe, Theme) | ✅ | |

### Markdown-Syntax (Live Preview, Lesemodus, Embeds)

| Feature | Status |
|---|---|
| Überschriften, Formatierung, `==Highlight==`, `%%Kommentare%%`, Tags | ✅ |
| Listen mit hängendem Einzug, Aufgaben mit Checkbox | ✅ |
| Links, Wikilinks mit Abschnitt/Alias, fehlende Ziele erkennbar | ✅ |
| Embeds: Notizen, Abschnitte (`#`), Blöcke (`#^id`), Bilder, Audio, Video, PDF | ✅ |
| Callouts mit Typen, Icons, Einklappen, Verschachtelung | ✅ |
| Tabellen, Codeblöcke, Trennlinien, Frontmatter (als Text) | ✅ |
| LaTeX (KaTeX + mhchem), Mermaid | ✅ |

### Navigation und Arbeitsbereich

| Feature | Status | Anmerkung |
|---|---|---|
| Tabs mit eigenem Editor je Tab, Drag & Drop, Wiederherstellung | ✅ | Kürzel mit Alt, weil Browser Cmd+T/W blockieren |
| Schnellwechsler (Cmd/Strg+O), Befehlspalette (Cmd/Strg+P) | ✅ | |
| Suche (Cmd/Strg+Shift+F) mit `"Phrase"`, `-`, `file:`, `path:`, `tag:` | ✅ | |
| Backlinks inkl. nicht verlinkter Erwähnungen und „Verlinken“ | ✅ | |
| Ausgehende Links, Gliederung | ✅ | |
| Graph-Ansicht (global, als Tab) und lokaler Graph | ✅ | Einstellungen in `graph.json` |
| Seitenleisten links/rechts mit Reitern | ✅ | |
| Einstellungen: Editor, Dateien & Links, Darstellung | ✅ | |

### Plugin-Kompatibilität

| Feature | Status | Anmerkung |
|---|---|---|
| Modul `obsidian`, Plugin-Loader aus `.obsidian/plugins/` | 🟡 | Reicht für remotely-save, Latex Suite und Omnisearch |
| DOM- und JS-Erweiterungen (`createEl`, `Array.first`, `node.win` …) | ✅ | |
| `Modal`, `Setting`, `Notice`, `Menu`, `PluginSettingTab`, `requestUrl`, `Platform` | ✅ | |
| `registerEditorExtension`, `workspace.updateOptions`, CodeMirror/Lezer per `require` | ✅ | Dieselben Instanzen wie im Editor |
| `editorInfoField`, `editorLivePreviewField`, `livePreviewState` | ✅ | `MarkdownFileInfo` ohne `editor` (keine `Editor`-Fassade) |
| `Scope`, `app.keymap`, `AbstractInputSuggest`, `MarkdownRenderer`, `sanitizeHTMLToDom`, `renderMath`, `i18next` | ✅ | `renderMath` rendert mit KaTeX statt MathJax, `\class` wird zu `\htmlClass` |
| `Editor`-Fassade, `MarkdownView`, `leaf.view`/`getViewState`, `getActiveViewOfType`, `editorCallback` | ✅ | `MarkdownView` umhüllt den Editor des Tabs; Splits/Anheften gibt es noch nicht |
| `Modal.scope`, `metadataCache.isUserIgnored`, `getAllTags`, `parseFrontMatterAliases`, `getLinkpath` | ✅ | |
| Omnisearch als unverändertes Original-Plugin | ✅ | Index in IndexedDB; ohne HTTP-API (braucht Node) und ohne Text-Extractor (PDF/Bilder) |
| Latex Suite als unverändertes Original-Plugin | 🟡 | Snippets, Tabstops, Formelvorschau, Einstellungen. Snippets lösen auch in Code aus, weil das Plugin Codeblöcke an Obsidians internen Knotennamen (`HyperMD-codeblock…`, `inline-code`) erkennt |

---

## 2. Was teilweise geht

| Bereich | Was fehlt noch |
|---|---|
| **Plugin-API** | `registerView`, `registerMarkdownPostProcessor`, `registerEditorSuggest` sind leere Stubs. `Editor` und `MarkdownView` decken die gängigen Methoden ab, `Workspace` kennt aber noch keine Splits und Seitenleisten-Leaves. |
| **Suche** | Es fehlen `OR`, reguläre Ausdrücke, `line:`, `block:`, `section:`, Groß-/Kleinschreibung beachten, Sortieroptionen und Suchen & Ersetzen. |
| **Einstellungen** | Es fehlen Tastenkürzel, Core-Plugins an/aus, Verwaltung der Community-Plugins (installieren, aktivieren, deaktivieren) und Dateien & Anhänge vollständig. |
| **Tastenkürzel** | Sie sind fest eingebaut; `hotkeys.json` wird nicht gelesen. |
| **Arbeitsbereich** | Tabs gibt es, Splits, angeheftete und gestapelte Tabs sowie Pop-out-Fenster fehlen. |
| **Frontmatter** | Es erscheint nur als Text. Die Properties-Ansicht mit Typen (`types.json`) fehlt. |
| **HTML in Notizen** | HTML erscheint als Text. Zum Rendern braucht es einen Sanitizer. |
| **Mobile Nutzung** | Es gibt nur einfache Anpassungen für schmale Bildschirme; Touch-Bedienung und ausfahrbare Seitenleisten fehlen. |
| **Speicher-Backends** | Nur OPFS. Echte lokale Ordner (File System Access), ZIP-Import/-Export und das Löschen von Vaults fehlen. |
| **Safari** | Vor Version 18.2 fehlt `createWritable`, dort ist kein Schreiben möglich. |

---

## 3. Was fehlt

### Schreiben im Editor

| Feature | Status |
|---|---|
| Listen beim Enter fortsetzen, Einrücken/Ausrücken von Listen | ✅ `useTab`, `tabSize`, `smartIndentList` aus `app.json`; beim Einrücken wird eine nummerierte Liste noch nicht neu bei 1 begonnen |
| Autovervollständigung für `[[Links]]` und `#Tags` | ✅ Dateien, Aliasse, `#Überschrift`, `#^Block`; noch ohne `[[##` (vaultweit), nicht verlinkte Ziele und Tags im Frontmatter |
| Klammern und Markdown-Zeichen automatisch schließen | ✅ `autoPairBrackets`, `autoPairMarkdown` aus `app.json` |
| Bilder einfügen/ablegen (Ablage nach `attachmentFolderPath`) | ✅ Auch andere Dateien per Drag & Drop; `useMarkdownLinks` wird beachtet |
| Syntax-Highlighting in Codeblöcken, Kopieren-Knopf | ✅ Sprachen aus `@codemirror/language-data`, im Lesemodus mit Prism-Klassen (`.token.keyword`) |
| Überschriften und Listen einklappen | ⬜ |
| Suchen & Ersetzen in der Notiz (eigene Oberfläche) | ⬜ |
| Kontextmenü im Editor, Formatierungsbefehle (fett, Link …) | ⬜ |
| Vim-Modus | ⬜ |
| Tabellen-Editor in der Live Preview | ⬜ |
| Fußnoten rendern | ⬜ |

### Organisieren

| Feature | Status |
|---|---|
| Properties-Ansicht und -Bearbeitung | ⬜ |
| Tag-Übersicht | ⬜ |
| Lesezeichen (`bookmarks.json`) | ⬜ |
| Tagesnotizen | ⬜ |
| Vorlagen | ⬜ |
| Explorer: Drag & Drop zum Verschieben, Mehrfachauswahl, Sortieroptionen, aktive Datei anzeigen | ⬜ |
| Seitenvorschau beim Hovern über Links | ⬜ |
| Wortzählung in der Statusleiste | ⬜ |
| Dateiwiederherstellung (Snapshots) | ⬜ |
| Canvas (JSON Canvas) | ⬜ |
| Bilder und PDFs als eigene Ansicht im Tab öffnen | ⬜ |

### Anpassen und Erweitern

| Feature | Status |
|---|---|
| Community-Themes und CSS-Snippets aus `.obsidian/themes` und `snippets` | ⬜ |
| Tastenkürzel aus `hotkeys.json` samt Einstellungsseite | ⬜ |
| Community-Plugins installieren, aktivieren und deaktivieren | ⬜ |
| Vollständigere Plugin-API (siehe Abschnitt 2) | ⬜ |
| Oberfläche in weiteren Sprachen (derzeit nur Deutsch) | ⬜ |

### Plattform

| Feature | Status |
|---|---|
| PWA / Offline-Betrieb (Service Worker, auch für `getResourcePath`) | ⬜ |
| Lokale Ordner über File System Access (Chromium) | ⬜ |
| Vault als ZIP importieren und exportieren, Vaults löschen | ⬜ |
| Mobiles Layout mit Touch-Bedienung | ⬜ |
| Große Vaults: virtualisierte Listen im Explorer und in der Suche | ⬜ |

### Technische Schulden

| Feature | Status |
|---|---|
| ESLint mit Schichtgrenzen (laut Konzept) | ⬜ |
| CI (Typecheck, Tests, Build und E2E-Tests bei jedem Push) | ✅ |
| E2E-Tests mit Playwright gegen einen echten Browser | 🟡 Kernabläufe abgedeckt; Graph, Einstellungen, Embeds, Kontextmenüs und Sync fehlen |
| Manuelle Abnahme aller umgesetzten Features in Chrome, Firefox und Safari | ⬜ |
| Fixture-Vault aus Obsidian Desktop für Kompatibilitätstests | ⬜ `e2e/fixtures/vault/` ist von Hand geschrieben |

### Bewusst nicht geplant

| Feature | Grund |
|---|---|
| Obsidian Sync und Publish | 🚫 Proprietäre Dienste; Sync läuft über remotely-save |
| Plugins mit `isDesktopOnly` oder Node/Electron-APIs | 🚫 Im Browser nicht ausführbar |

---

## 4. Vorschlag für die Reihenfolge

Die Reihenfolge richtet sich nach dem Nutzen im Alltag. Jede Stufe ist für sich nutzbar.

| Stufe | Inhalt | Warum jetzt |
|---|---|---|
| **A – Abnahme** | ~~CI~~, ~~E2E-Grundgerüst mit Kernabläufen~~, weitere E2E-Tests, manuelle Prüfung in drei Browsern | Viele Features sind nur automatisiert getestet. Fehler im echten Browser sollten auffallen, bevor mehr darauf aufbaut. Die ersten E2E-Tests haben bereits zwei Fehler gefunden (Firefox-Start, Inline-Titel). |
| **B – Schreiben** | ~~Listen fortsetzen~~, ~~`[[`-Autovervollständigung~~, Bilder einfügen, Code-Highlighting, Formatierungsbefehle, Wortzählung | Betrifft jede Minute im Editor. |
| **C – Organisieren** | Properties, Tags, Lesezeichen, Tagesnotizen, Vorlagen, Drag & Drop im Explorer, Seitenvorschau | Die meistgenutzten Core-Plugins nach Suche und Backlinks. |
| **D – Anpassen** | Themes und Snippets, `hotkeys.json`, Plugin-Verwaltung, Plugin-API (Views, Editor, Post-Processor) | Öffnet den Weg für Community-Plugins. |
| **E – Plattform** | PWA/Offline, lokale Ordner, ZIP-Import/-Export, mobiles Layout, Safari-Fallback | Macht die App unabhängig von einem einzelnen Browser-Profil. |
| **F – Layout und Canvas** | Splits, angeheftete Tabs, Canvas | Groß im Aufwand, seltener im Alltag. |
