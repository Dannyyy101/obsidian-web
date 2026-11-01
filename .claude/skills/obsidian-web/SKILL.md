---
name: obsidian-web
description: Arbeiten am Projekt obsidian-web, einer Browser-Umsetzung von Obsidian (Vault, Editor, Markdown-Syntax, Workspace, Core-Plugins, Plugin-API). Nutzen bei jeder Implementierung, jedem Refactoring oder jeder Architekturfrage in diesem Repository, insbesondere beim Hinzufügen von Markdown-Syntax, Core-Plugins, Views, Befehlen oder Speicher-Adaptern.
---

# obsidian-web

Ziel: Obsidian vollständig im Browser abbilden, mit voller Kompatibilität zu bestehenden Vaults.
Das ausführliche Konzept steht in `docs/KONZEPT.md`. Lies es, bevor du größere Änderungen planst.

## Unverhandelbare Regeln

1. **Vault-Kompatibilität geht vor.** Schreibe nur Formate, die auch Obsidian Desktop schreibt:
   Markdown, YAML-Frontmatter, `.canvas` (JSON Canvas) und `.obsidian/*.json`. Führe keine eigenen
   Dateien oder Felder im Vault ein. Interne Caches liegen in IndexedDB und müssen sich jederzeit neu
   aufbauen lassen.
2. **Benenne nach der Obsidian-API.** Klassen, Methoden und Events heißen wie in `obsidian.d.ts`
   (`Vault.read`, `MetadataCache.getFileCache`, `Workspace.getLeaf`, Event `rename` …). Bevor du
   einen neuen Namen erfindest, prüfe, ob die Obsidian-API dafür schon einen hat.
3. **Halte die Schichtgrenzen ein.** Imports gehen nur nach unten:
   `app → plugins/api → ui/editor → markdown/core → storage/shared`.
   `core`, `markdown`, `storage` und `shared` greifen **nicht** auf das DOM zu, weil sie auch im Worker laufen.
4. **Core-Plugins nutzen nur die öffentliche API.** Ein Core-Plugin unter `src/plugins/` darf keine
   Interna aus `core/` oder `ui/` importieren, die ein Community-Plugin nicht auch hätte. Fehlt etwas,
   erweitere die API.
5. **Clean-Room.** Grundlage sind nur öffentliche Doku und die MIT-Typdefinitionen aus
   `obsidian-api`. Kopiere keinen Code, kein CSS und keine Assets aus der Obsidian-App.
6. **Halte die Obsidian-DOM-Klassen ein.** Gerenderte Elemente tragen Obsidians Klassennamen und
   CSS-Variablen (`.markdown-rendered`, `.callout[data-callout]`, `.internal-link`, `--text-normal`,
   `--background-primary` …), damit Community-Themes funktionieren.
7. **Jedes Feature bekommt einen eigenen Branch.** Arbeite nie direkt auf `main`, siehe
   [Git-Workflow](#git-workflow).

## Git-Workflow

- **Ein Branch pro Feature, bevor die erste Änderung geschrieben wird.** Erzeuge ihn vom aktuellen
  `main`: `git switch main && git pull && git switch -c feature/<kurzname>`. Der Kurzname ist kebab-case
  und beschreibt das Feature (`feature/tabs`, `feature/properties-view`).
- **Fehlerbehebungen** laufen genauso, nur mit dem Präfix `fix/` (`fix/safari-nfd-paths`).
- **Ein Branch enthält genau ein Feature.** Ergibt sich unterwegs ein zweites, kommt es in einen eigenen
  Branch.
- **Parallele Sitzungen** arbeiten in eigenen Worktrees (`git worktree add ../obsidian-web-<kurzname>
  -b feature/<kurzname>`), damit sie sich nicht gegenseitig Dateien überschreiben.
- **Vor dem Mergen** müssen `pnpm typecheck && pnpm lint && pnpm test` grün sein. Gemergt wird erst nach Freigabe
  durch den Nutzer.

## Projektkarte

| Pfad | Verantwortung |
|---|---|
| `src/shared/` | Pfad-Utils, `Events`, Helfer ohne DOM |
| `src/storage/` | `DataAdapter` + `FsAccessAdapter`, `OpfsAdapter`, `MemoryAdapter` |
| `src/core/` | `App`, `Vault`, `MetadataCache` (+ `worker/`), `FileManager`, Commands, Config |
| `src/markdown/syntax/<element>/` | Je Syntax-Element eine `lezer.ts` (gemeinsamer Parser für Editor, Lesemodus, Embeds) |
| `src/markdown/sections.ts` | Abschnitte und Blöcke für Embeds (`#Überschrift`, `#^id`) |
| `src/editor/render/` | Renderer: Lesemodus, Embeds, Callouts, Tabellen, Formeln, Mermaid |
| `src/markdown/metadata.ts` | `computeMetadata` → `CachedMetadata` (Links, Embeds, Tags, Überschriften, Blöcke, Frontmatter) |
| `src/core/metadata-cache.ts` | Index aller Notizen, `resolvedLinks`, Backlinks, Linkauflösung; parst im Worker (`core/worker/`) |
| `src/core/file-manager.ts` | Umbenennen/Verschieben mit Link-Update (`alwaysUpdateLinks`) |
| `src/core/search.ts` | Suchsyntax und Treffer (rein, testbar); UI in `src/ui/views/` |
| `src/markdown/render/` | `MarkdownRenderer`: AST → DOM |
| `src/editor/` | CodeMirror 6, Live Preview, `Editor`-Fassade |
| `src/ui/` | Workspace-Baum, `WorkspaceLeaf`, `View`/`ItemView`, Modal, Menu, Notice, Setting |
| `src/plugins/<id>/` | Ein Core-Plugin pro Ordner, `index.ts` exportiert eine `Plugin`-Klasse (der Datei-Explorer liegt bis Phase 4 noch in `src/ui/file-explorer.ts`) |
| `src/api/` | `obsidian.ts` (Modul für `require("obsidian")`), `plugin.ts`, `plugin-manager.ts`, `request-url.ts`, `platform.ts` |
| `src/app/app.ts` | `App`: verbindet Vault, Workspace, Editor, Explorer, Settings, Plugins |
| `server/cors-proxy.ts` | Vite-Middleware `/__proxy`: Ersatz für Electrons CORS-freies `requestUrl` |
| `scripts/fetch-plugins.mjs` | Lädt mitgelieferte Plugins (remotely-save) nach `public/bundled-plugins/` |
| `e2e/` | Playwright-Tests (`*.e2e.ts`) in Chromium, Firefox, WebKit; Helfer in `e2e/fixtures.ts`, Fixture-Vault in `e2e/fixtures/vault/` (mit Obsidian Desktop angelegt, Notizen für die Tests ergänzt) |
| `tests/fixtures/syntax/` | Syntax-Korpus: `name.md` + `name.html` + `name.cache.json` |

## Häufige Aufgaben

### Neue Markdown-Syntax hinzufügen

1. Schreibe die Lezer-Erweiterung in `src/markdown/syntax/<name>/lezer.ts`, registriere sie in
   `syntax/index.ts` und teste Randfälle in `tests/markdown-syntax.test.ts`.
2. Live Preview: Fall in `src/editor/live-preview/decorations.ts` (mehrzeilige Blöcke über
   `blockWidgetFor`), Test in `tests/live-preview.test.ts`.
3. Renderer (Lesemodus, Embeds, Callouts): Fall in `src/editor/render/`, Test in
   `tests/render.test.ts`.
4. Falls die Syntax Metadaten erzeugt (Link, Tag, Block …), ergänze `CachedMetadata`.

Prüfe das Verhalten immer gegen die Obsidian-Hilfe (help.obsidian.md) und, wenn möglich, gegen die
Desktop-App. Randfälle wie Leerzeichen in Tags, verschachtelte Callouts oder Links mit `|` und `#`
sind die häufigsten Fehlerquellen.

Es gibt **einen** Parser für alles (siehe `docs/KONZEPT.md` 3.3): Lezer-Erweiterungen in
`src/markdown/syntax/*/lezer.ts` mit Tests in `tests/markdown-syntax.test.ts`. Eine micromark-Seite
gibt es nicht. Neue Syntax braucht außer Parser und Live Preview auch einen Fall im Renderer
(`src/editor/render/inline.ts` bzw. `markdown.ts`, Tests in `tests/render.test.ts`), sonst fehlt
sie im Lesemodus und in Embeds. Die Live Preview liegt in `src/editor/live-preview/`: Ein Element zeigt seine Syntax,
sobald die Auswahl es berührt; Zeilenmarker wie `#` und `>` zeigen sie, sobald der Cursor in der
Zeile steht. Neue Syntax braucht dort einen Fall in `decorations.ts` und einen Test in
`tests/live-preview.test.ts`.

### Neues Core-Plugin

1. Lege `src/plugins/<id>/index.ts` an mit `export default class extends Plugin`, die ID entspricht
   Obsidians Core-Plugin-ID (`file-explorer`, `backlink`, `graph` …).
2. Registriere Views über `this.registerView`, Befehle über `this.addCommand`, Events über
   `this.registerEvent`, damit `onunload` alles automatisch aufräumt.
3. Trage das Plugin in die Core-Plugin-Registry ein. Ob es aktiv ist, steht in
   `.obsidian/core-plugins.json`.
4. Schreibe einen E2E-Test, der das Plugin auf dem Fixture-Vault bedient.

### Community-Plugin zum Laufen bringen bzw. Shim erweitern

1. Prüfe den Quellcode des Plugins: Welche Exporte aus `obsidian` importiert es? Achte auf
   mehrzeilige Imports. Welche `app.*`- und `vault.adapter.*`-Aufrufe macht es, und welche Globals
   wie `window.moment` oder `createEl` nutzt es?
2. Ergänze fehlende Exporte in `src/api/obsidian.ts`. Signatur und Verhalten richten sich nach
   `obsidian.d.ts`, nicht nach dem, was das eine Plugin gerade braucht.
3. Ändere nie das Plugin selbst. Lade immer den Release-Build unverändert.
4. Sichere das Plugin mit einem Integrationstest wie `tests/remotely-save.test.ts` ab
   (happy-dom-Globals, Node-`fetch`, `fake-indexeddb`).

remotely-save ist das Referenz-Plugin. Jede Änderung an `storage/`, `core/vault.ts` oder
`api/request-url.ts` muss `tests/remotely-save.test.ts` bestehen. Kritisch ist, dass
`writeBinary(…, { mtime })` exakt diese `mtime` in `stat` und `TFile.stat` zurückliefert, sonst
lädt der Sync bei jedem Lauf alles neu.

### Neuer Befehl

Befehls-IDs folgen dem Schema `<plugin-id>:<aktion>` (z. B. `editor:toggle-bold`). Nutze dieselbe ID
wie Obsidian, damit die Hotkeys aus `hotkeys.json` greifen.

### Neuer Speicher-Adapter

Implementiere die Schnittstelle `DataAdapter` vollständig und lass die gemeinsame Adapter-Testsuite
(`tests/storage/adapter.suite.ts`) gegen die neue Implementierung laufen. Pfade sind immer
vault-relativ und verwenden `/`.

**Unicode:** Pfade aus Speicher oder Sync behalten im Adapter und im Vault exakt ihre
Schreibweise. Nutze dort `cleanPath`, nicht `normalizePath`, das zu NFC umwandelt. Gefunden werden
Pfade unabhängig von NFC und NFD (`unicodeKey`). Backends dürfen Namen umschreiben, Safaris OPFS
speichert z. B. NFD. Die ursprüngliche Schreibweise stellt `scan` aus dem TimesStore wieder her.
`normalizePath` ist nur für Benutzereingaben gedacht.

## Befehle

```bash
pnpm install         # lädt per postinstall auch die mitgelieferten Plugins
pnpm dev             # Dev-Server inkl. CORS-Proxy (http://localhost:5173)
pnpm test            # Vitest: Unit-Tests + remotely-save-Integrationstest
pnpm test:e2e        # Playwright: E2E-Tests in Chromium, Firefox, WebKit (startet den Dev-Server selbst)
pnpm typecheck       # tsc --noEmit
pnpm lint            # ESLint: Schichtgrenzen und kein DOM in core/markdown/storage/shared
pnpm build           # Typecheck + Produktions-Build
pnpm fetch-plugins   # Plugins neu laden (--force überschreibt)
```

Führe vor dem Abschluss einer Aufgabe `pnpm typecheck && pnpm lint && pnpm test` aus, bei Änderungen
an der Oberfläche auch `pnpm test:e2e`. ESLint liegt mit eigenem TypeScript 6 im Workspace-Paket
`tools/eslint/`, weil `@typescript-eslint/parser` die JS-API braucht, die TypeScript 7 nicht mehr hat.
Die Regeln stehen in `tools/eslint/config.js`.

### E2E-Test schreiben

Nutze `test` aus `e2e/fixtures.ts`: Die Fixture `vault` liefert eine Seite mit geöffnetem
Fixture-Vault, `vaultName` dessen Namen (für `readVaultFile`). Jeder Test hat einen eigenen
Vault-Namen, weil WebKit das OPFS zwischen allen Profilen teilt. Warte nach dem Öffnen einer Datei
mit `expectOpen`, sonst prüft der Test den Editor, bevor die Datei geladen ist. Der Fixture-Vault
enthält ein Platzhalter-Manifest für remotely-save, damit dessen Willkommensdialog nicht stört.

### Neue Seitenleisten-Ansicht

Leite von `IndexView` (`src/ui/views/index-view.ts`) ab: `refresh()` läuft gebündelt und nur,
wenn der Reiter sichtbar ist. Registriere die Ansicht in `App` über `addIndexView` in
`leftSidebar` oder `rightSidebar`. Für Auswahl und Navigation nutze `app.openFileAt(file, from, to)`.

## Konventionen

- TypeScript strict, kein `any` außer im `api/`-Shim, wo die Obsidian-Typen es vorgeben.
- Dateinamen in kebab-case, Klassennamen wie in der Obsidian-API.
- Gib Ressourcen über `Component.register*` frei, nicht über eigene Cleanup-Listen.
- Schreibende Dateioperationen laufen ausschließlich über `Vault` oder `FileManager`, nie direkt über den Adapter.
- Lange Arbeit wie Parsen oder Indexieren gehört in den Worker und nicht in den Main-Thread.
- Größere Architekturentscheidungen werden als ADR unter `docs/adr/NNNN-titel.md` festgehalten.

## Referenzen

- Obsidian-Hilfe (Verhalten, Syntax): https://help.obsidian.md
- Entwicklerdoku (API, Plugins, Themes): https://docs.obsidian.md
- API-Typen: https://github.com/obsidianmd/obsidian-api (`obsidian.d.ts`)
- JSON Canvas: https://jsoncanvas.org
- CodeMirror 6: https://codemirror.net/docs/
