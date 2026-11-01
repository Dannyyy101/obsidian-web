# obsidian-web – Konzept

Ziel: Obsidian vollständig im Browser abbilden. Ein bestehender Vault wird geöffnet, bearbeitet und
gespeichert, und danach kann ihn die Desktop-App von Obsidian ohne Unterschied weiterverwenden.

Stand: 2026-10-30 · Status: Entwurf

---

## 1. Leitprinzipien

1. **Der Vault ist die Wahrheit.** Alle Daten liegen als Markdown-Dateien und Anhänge im Vault,
   die Konfiguration in `.obsidian/`. Wir führen kein eigenes Datenformat ein. Caches wie der Index
   in IndexedDB lassen sich jederzeit verwerfen und aus dem Vault neu aufbauen.
2. **Kompatibel in beide Richtungen.** Was obsidian-web schreibt, muss Obsidian Desktop lesen
   können, und umgekehrt. Das gilt für Markdown-Syntax, Frontmatter, `.canvas` (JSON Canvas),
   `workspace.json`, `app.json`, Hotkeys, Themes und CSS-Snippets.
3. **Local-first.** Die App funktioniert ohne Server, offline und als PWA. Ein Server ist ein
   optionales Speicher-Backend und keine Voraussetzung.
4. **Die API orientiert sich an Obsidian.** Interne Klassen heißen wie in der öffentlichen
   Obsidian-API (`App`, `Vault`, `TFile`, `MetadataCache`, `Workspace`, `WorkspaceLeaf`,
   `ItemView`, `Plugin` …). Core-Plugins nutzen dieselbe API wie später die Community-Plugins.
5. **Clean-Room.** Grundlage sind nur öffentliche Quellen: die Hilfe unter help.obsidian.md, die
   Entwicklerdoku unter docs.obsidian.md und die MIT-lizenzierten Typdefinitionen aus `obsidian-api`.
   Wir übernehmen keinen proprietären Code und keine proprietären Assets.

## 2. Funktionsumfang

| Bereich | Umfang |
|---|---|
| Vault | Ordner öffnen, Dateibaum, Dateien und Ordner anlegen, umbenennen, verschieben und löschen, Anhänge, Papierkorb (`.trash`) |
| Editor | Quellmodus, Live Preview, Lesemodus, Vim-Modus, Tastenkürzel, Multi-Cursor |
| Markdown | CommonMark + GFM, Wikilinks `[[…]]`, Embeds `![[…]]`, Überschriften- und Block-Links `#` / `^id`, Callouts, Tags, `==Highlight==`, `%%Kommentare%%`, Fußnoten, LaTeX (KaTeX, siehe Abschnitt 4), Mermaid, Properties (YAML-Frontmatter) |
| Linking | Linkauflösung (kürzester Pfad), Backlinks, ausgehende Links, unverlinkte Erwähnungen, Umbenennen mit automatischem Nachziehen der Links |
| Workspace | Tabs, Splits, linke und rechte Sidebar, Tab-Gruppen, Pop-out (als neues Browserfenster), Layout wird in `workspace.json` gespeichert |
| Core-Plugins | Datei-Explorer, Suche, Schnellwechsler, Befehlspalette, Backlinks, ausgehende Links, Tags, Gliederung, Graph (global und lokal), Properties, Lesezeichen, Tagesnotizen, Vorlagen, Canvas, Wortzählung, Seitenvorschau, Dateiwiederherstellung |
| Darstellung | Hell und dunkel, Community-Themes und CSS-Snippets über dieselben CSS-Variablen und Klassennamen wie Obsidian |
| Erweiterbarkeit | Community-Plugins über ein `obsidian`-Modul-Shim (Teil-Shim seit Meilenstein 1, siehe Abschnitt 8) |

**Nicht-Ziele:** Obsidian Sync und Publish (proprietäre Dienste), Electron- und Node-APIs (`fs`,
`require('electron')`) und Plugins, die darauf angewiesen sind.

## 3. Architektur

Die Schichten haben eine feste Abhängigkeitsrichtung: Eine Schicht darf nur Schichten importieren,
die in der Liste **unter** ihr stehen.

```
┌──────────────────────────────────────────────────────────┐
│ app/          Bootstrapping, PWA, Vault-Auswahl            │
├──────────────────────────────────────────────────────────┤
│ plugins/      Core-Plugins (je eines pro Ordner)           │
│ api/          obsidian-Shim für Community-Plugins          │
├──────────────────────────────────────────────────────────┤
│ ui/           Workspace-Layout, Views, Modals, Menüs        │
│ editor/       CodeMirror 6, Live Preview, Lesemodus         │
├──────────────────────────────────────────────────────────┤
│ markdown/     Parser + Renderer für Obsidian-Syntax         │
│ core/         App, Vault, MetadataCache, Events, Commands  │
├──────────────────────────────────────────────────────────┤
│ storage/      Speicher-Adapter (FS Access, OPFS, Remote)    │
│ shared/       Pfade, Events, Utils (ohne DOM)               │
└──────────────────────────────────────────────────────────┘
```

Schichten im selben Block dürfen sich gegenseitig importieren. Core-Plugins importieren nur aus
`api/`. Einzige Ausnahme nach oben ist der reine Typ-Import von `App` aus `app/app.ts`, den `api/`,
`ui/` und `editor/` wie in `obsidian.d.ts` überall herumreichen; zur Laufzeit entsteht dadurch
keine Abhängigkeit. `core/`, `markdown/`, `storage/` und `shared/` nutzen weder `window` noch
`document`. `pnpm lint` prüft diese Regeln (`tools/eslint/config.js`).

### 3.1 storage – Speicher-Adapter

Eine gemeinsame Schnittstelle `DataAdapter` mit `list`, `stat`, `read`, `readBinary`, `write`,
`writeBinary`, `rename`, `remove`, `mkdir` und `watch`. Sie entspricht Obsidians `DataAdapter`.

| Adapter | Einsatz |
|---|---|
| `FsAccessAdapter` | File System Access API: echter lokaler Ordner (Chromium-Browser) |
| `OpfsAdapter` | Origin Private File System: Fallback für Firefox und Safari, Import und Export als ZIP |
| `MemoryAdapter` | Tests und Demo-Vault |
| `RemoteAdapter` | Später: eigener Server oder WebDAV |

Weil der Browser kein natives Dateisystem-Watching hat, überwacht `watch` den Vault per Polling über
mtime und Größe und wird ergänzt, sobald `FileSystemObserver` verfügbar ist.

### 3.2 core – das Herzstück

- **`Events`**: typisierter Event-Emitter, gemeinsame Basis aller Komponenten.
- **`Vault`**: Dateibaum aus `TAbstractFile`, `TFile` und `TFolder` und die Events `create`,
  `modify`, `delete` und `rename`. Er ist die einzige Komponente, die mit dem Adapter spricht.
- **`MetadataCache`**: liest pro Datei Überschriften, Links, Embeds, Tags, Blöcke, Frontmatter und
  Listen-Items (`CachedMetadata`). Das Parsen läuft in einem **Web Worker**, das Ergebnis wird in
  IndexedDB nach mtime gecacht. Darauf bauen `resolvedLinks` und `unresolvedLinks` und damit Backlinks
  und Graph auf.
- **`FileManager`**: Umbenennen und Verschieben mit Aktualisierung der Links, neue Dateien nach den
  Einstellungen anlegen.
- **`CommandRegistry` / `Hotkeys`**: Befehle mit IDs (`editor:toggle-bold` …), Bindung über
  `hotkeys.json`.
- **`Config`**: liest und schreibt `.obsidian/*.json`.

### 3.3 markdown – ein Parser für alles

Obsidian-Syntax wird im Editor (Highlighting, Live Preview), im Lesemodus, in Embeds und im
`MetadataCache` gebraucht. **Entscheidung:** Alle nutzen denselben Parser, `@lezer/markdown` mit
eigenen Erweiterungen (`src/markdown/syntax/`). Ursprünglich war micromark für den Lesemodus
geplant. Ein einziger Parser schließt aber aus, dass Live Preview und Lesemodus dieselbe Notiz
unterschiedlich interpretieren, und spart die doppelte Pflege jeder Syntax.

Der Renderer (`src/editor/render/`) erzeugt DOM mit Obsidians Klassennamen (`.callout`,
`.internal-link`, `.markdown-rendered` …), damit Themes funktionieren.

### 3.4 editor – CodeMirror 6

- `MarkdownView` mit drei Modi: Quellmodus, Live Preview und Lesemodus.
- Live Preview arbeitet mit Decorations, die die Syntax außerhalb der Cursorzeile ausblenden, und mit
  Widgets für Embeds, Callouts, Tabellen und Mathe.
- Eine `Editor`-Fassade bildet die Obsidian-`Editor`-API nach (`getCursor`, `replaceRange` …).

### 3.5 ui – Workspace

- Ein Layout-Baum aus `WorkspaceSplit`, `WorkspaceTabs` und `WorkspaceLeaf`, der sich nach
  `workspace.json` serialisieren lässt.
- `View`/`ItemView` arbeitet **imperativ** über `containerEl`, wie in Obsidian. So kann jede View
  intern beliebige Technik nutzen.
- Die UI-Bausteine (Modal, Menu, Notice, Setting, SuggestModal, FuzzySuggestModal) kommen als
  kleine Vanilla-TS-Komponenten mit Obsidians DOM-Struktur und Klassennamen. Icons stammen aus Lucide.

### 3.6 plugins – Core-Plugins

Jedes Core-Plugin ist ein `Plugin` mit `onload` und `onunload` und nutzt nur die öffentliche API.
Ein- und Ausschalten läuft über `core-plugins.json`. Komplexe Views dürfen intern Svelte nutzen,
etwa der Graph (WebGL über `pixi.js` oder `sigma.js`) oder Canvas.

### 3.7 api – Community-Plugins

Ein Modul `obsidian` stellt die API aus `obsidian.d.ts` bereit. Plugins werden aus
`.obsidian/plugins/<id>/main.js` geladen und mit einem CommonJS-Wrapper ausgeführt, der
`require('obsidian')` auf den Shim umleitet. Plugins, die `isDesktopOnly: true` setzen oder
Node-Module brauchen, werden markiert und nicht geladen. `syntaxTree` liefert Plugins im
Markdown-Editor Obsidians HyperMD-Knotennamen (siehe `docs/adr/0001-hypermd-syntaxbaum-fuer-plugins.md`).

## 4. Tech-Stack

| Thema | Wahl | Begründung |
|---|---|---|
| Sprache | TypeScript (strict) | Typen aus `obsidian-api` lassen sich direkt übernehmen |
| Build | Vite | Schnell, Worker-Support, PWA-Plugin |
| Paketmanager | pnpm | |
| Editor | CodeMirror 6 | Auch Obsidian nutzt CM6, Vim-Modus über `@replit/codemirror-vim` |
| Markdown | `@lezer/markdown` (+ eigene Erweiterungen) | Ein Parser für Editor, Lesemodus und Embeds (siehe 3.3) |
| LaTeX | KaTeX (+ mhchem), erst bei Bedarf geladen | Obsidian nutzt MathJax. KaTeX rendert synchron und deutlich schneller, was in der Live Preview beim Tippen zählt. Die gängige Syntax deckt es ab; Exoten wie `\require` fehlen. |
| UI | Vanilla TS (API-Schicht), Svelte 5 (komplexe Views) | Bleibt nah an Obsidians imperativem View-Modell |
| Persistenz-Cache | IndexedDB (`idb`) | |
| Tests | Vitest (Unit), Playwright (E2E) | |
| Lint | ESLint + `eslint-plugin-boundaries` | Erzwingt die Schichtregeln aus Abschnitt 3 |

Zunächst **ein Paket** mit klar getrennten Ordnern unter `src/`. Ein Monorepo erst, wenn ein Teil
(etwa `markdown/`) wirklich separat veröffentlicht werden soll.

## 5. Verzeichnisstruktur

```
obsidian-web/
├── docs/                    Konzept, Entscheidungen (docs/adr/NNNN-*.md)
├── public/                  PWA-Manifest, Icons, bundled-plugins/ (per Skript geladen)
├── scripts/                 fetch-plugins.mjs
├── server/                  cors-proxy.ts (Vite-Middleware), prod.ts (Produktions-Server)
├── src/
│   ├── shared/              path.ts, events.ts, debounce.ts …
│   ├── storage/             DataAdapter + Adapter-Implementierungen
│   ├── core/                App, Vault, MetadataCache, FileManager, Commands, Config
│   │   └── worker/          Parse-Worker für den MetadataCache
│   ├── markdown/
│   │   ├── syntax/          Je Syntax-Element eine Lezer-Erweiterung
│   │   └── render/          MarkdownRenderer → DOM
│   ├── editor/              CM6-Setup, Live Preview, Editor-Fassade
│   ├── ui/                  Workspace, Leaf, View, Modal, Menu, Notice, Setting
│   ├── plugins/             file-explorer/, search/, graph/, backlinks/, canvas/ …
│   ├── api/                 obsidian-Shim + Plugin-Loader
│   ├── app/                 App (verbindet alle Teile)
│   ├── styles/              app.css (Obsidian-kompatible CSS-Variablen)
│   └── main.ts
├── tests/
│   ├── fixtures/vault/      Beispiel-Vault, der mit Obsidian Desktop erstellt wurde
│   ├── fixtures/syntax/     Syntax-Korpus (Eingabe + erwartete Ausgabe)
│   └── e2e/
└── .claude/skills/obsidian-web/SKILL.md
```

## 6. Roadmap

| Phase | Inhalt | Ergebnis |
|---|---|---|
| 0 | Projekt-Setup, Tests, Fixture-Vault (Lint-Grenzen und CI fehlen noch) | Leere App startet, Tests laufen |
| 1 ✅ | **Sync-MVP:** OPFS-Speicher, `Vault`, Datei-Explorer, CM6-Quellmodus, Teil-Shim `obsidian`, remotely-save (siehe Abschnitt 8) | Vault im Browser bearbeiten und mit Desktop und Mobile synchronisieren |
| 2 ✅ | `markdown`-Syntax, Lesemodus, Linkauflösung, `MetadataCache`-Index (Worker + IndexedDB-Cache), Backlinks | Wikilinks klickbar, Backlinks |
| 3 🟡 | Live Preview ✅ (Formatierung, Überschriften, Listen, Aufgaben, Links, Wikilinks, Bilder, Tabellen, Codeblöcke, Tags, Highlights, Kommentare, Frontmatter, LaTeX, Callouts, Embeds von Notizen/Abschnitten/Blöcken/Medien, Mermaid), Fußnoten; offen: Properties-Ansicht | Editor fühlt sich an wie Obsidian |
| 4 🟡 | Befehlspalette ✅, Schnellwechsler ✅, Hotkeys aus `hotkeys.json` ✅; offen: Tabs, Splits, rechte Sidebar, `workspace.json`, Hotkey-Einstellungen | Komplette Arbeitsoberfläche |
| 5 🟡 | Suche ✅, Gliederung ✅, ausgehende Links ✅, Umbenennen mit Link-Update ✅; offen: Tags-Ansicht, Properties, Lesezeichen, Tagesnotizen, Vorlagen | Funktionsgleich mit dem Kern von Obsidian |
| 6 | Graph, Canvas, Themes und Snippets, Einstellungsdialog | Visuelle Vollständigkeit |
| 7 | `obsidian`-Shim vervollständigen (Views, Editor-API, MetadataCache), Plugin-Verwaltung in den Einstellungen | Weitere Community-Plugins laufen |
| 8 | PWA/Offline, OPFS-Fallback, Remote-Adapter, mobiles Layout | Überall nutzbar |

Jede Phase endet mit einem Kompatibilitätstest: Den Fixture-Vault in obsidian-web bearbeiten, in
Obsidian Desktop öffnen, und es gibt keine Unterschiede, Fehler oder kaputten Links.

## 7. Offene Entscheidungen

1. **Server-Komponente:** Entschieden für Self-Hosting. Der Sync braucht einen CORS-Proxy
   (Abschnitt 8). In Produktion liefert `server/prod.ts` (Node ohne Abhängigkeiten) `dist/` aus und
   stellt `/__proxy` bereit. Weil der Proxy offen ist, läuft er nur hinter einer Anmeldung
   (oauth2-proxy mit OIDC, siehe `deploy/`). `PROXY_ALLOWED_HOSTS` beschränkt optional die Ziele.
2. **Browser-Ziel:** Entschieden für OPFS als primären Speicher, weil er überall ohne
   Berechtigungsdialog läuft und der Sync die Vault-Quelle ist. `FsAccessAdapter` für echte lokale
   Ordner folgt später als Option für Chromium.
3. **Graph-Renderer:** `pixi.js` (wie Obsidian) oder `sigma.js`.
4. **Umfang der Plugin-Kompatibilität:** Nur die API-Oberfläche, oder auch interne, nicht
   dokumentierte Objekte, auf die viele Plugins zugreifen (`app.plugins`, `app.internalPlugins`)?
5. **Name und Branding:** „Obsidian“ ist eine Marke von Dynalist Inc. Für eine Veröffentlichung
   brauchen wir einen eigenen Namen.

## 8. Meilenstein 1: Sync mit remotely-save

Das erste Ziel ist ein Vault, der sich im Browser bearbeiten und mit Obsidian Desktop und Mobile
synchronisieren lässt. Dafür reichen Datei-Explorer, Editor und das Plugin
[remotely-save](https://github.com/remotely-save/remotely-save).

### Entscheidung: Original-Plugin statt Portierung

obsidian-web führt das **unveränderte Release-`main.js`** über den `obsidian`-Shim aus und portiert
den Code nicht. Dafür gibt es drei Gründe:

- Der Sync-Algorithmus und das Format auf dem Server sind exakt die von Desktop und Mobile.
  Bei einer Portierung würden sie mit jeder neuen Plugin-Version auseinanderlaufen.
- Updates kommen ohne eigenen Aufwand mit einer neuen Release-Version.
- Der Shim entsteht so entlang eines echten, großen Plugins und nicht am Reißbrett.

Die Release-Dateien werden nicht eingecheckt, weil `pro/` unter der PolyForm-Strict-Lizenz steht.
`pnpm fetch-plugins` lädt sie nach `public/bundled-plugins/`. Beim ersten Öffnen eines Vaults
installiert die App das Plugin nach `.obsidian/plugins/remotely-save/`. Kommt ein Plugin per Sync
aus dem Desktop-Vault, hat diese Version Vorrang.

### Was das Plugin braucht

| Bereich | Genutzte API | Umsetzung |
|---|---|---|
| Lokale Dateien | `vault.adapter.{list, stat, exists, readBinary, writeBinary(mtime, ctime), mkdir, rename, trashLocal, trashSystem}`, `vault.getAllLoadedFiles()`, `TFile.stat` | `IndexedAdapter` über OPFS |
| Zeitstempel | Der Sync vergleicht `mtime` und setzt sie beim Download | OPFS kann keine `mtime` setzen, daher speichert IndexedDB `mtime` und `ctime` pro Pfad (`IdbTimesStore`) |
| Netzwerk | `requestUrl`, `request` (S3, WebDAV, OneDrive) | Über den CORS-Proxy `/__proxy` (`server/cors-proxy.ts`), weil Electron CORS umgeht, der Browser aber nicht |
| Events | `vault.on(modify, create, delete, rename)`, `workspace.onLayoutReady`, `workspace.on("file-menu")` | Der Vault spiegelt alle Adapter-Änderungen, auch die des Plugins selbst |
| UI | `Modal`, `Setting` mit allen Controls, `Notice`, `PluginSettingTab`, `addRibbonIcon`, `addStatusBarItem`, `addCommand`, `addIcon` und `setIcon` | Nachbau mit Obsidians DOM-Struktur und Klassennamen |
| Globals | DOM-Erweiterungen (`createEl`, `toggleClass` …), `window.moment`, `Platform`, `requireApiVersion` | `src/ui/dom.ts`, `src/api/` |

### Einschränkungen im Browser

- **OAuth über `obsidian://`** (Dropbox, OneDrive): Der Browser kann die Rücksprung-URI nicht
  empfangen. Als Umweg authentifiziert man sich in Desktop oder Mobile, exportiert dort die
  Einstellungen als URI und führt sie in obsidian-web über den Befehl
  „Obsidian-URI ausführen“ aus. Alternativ hängt man sie als `?uri=` an die URL.
- **S3 und WebDAV** laufen über den Proxy, ohne CORS-Konfiguration auf dem Server.
- **Safari < 18.2** fehlt `createWritable` für OPFS, dort ist noch kein Schreiben möglich.

### Absicherung

`tests/remotely-save.test.ts` lädt das echte Plugin in zwei obsidian-web-Vaults und lässt beide über
einen lokalen WebDAV-Server und den CORS-Proxy synchronisieren. Geprüft werden Anlegen, Ändern
und Löschen in beide Richtungen und dass ein Sync ohne Änderungen nichts überträgt.
