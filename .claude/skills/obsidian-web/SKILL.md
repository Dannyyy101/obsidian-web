---
name: obsidian-web
description: Work on obsidian-web, a browser implementation of Obsidian (vault, editor, Markdown syntax, workspace, core plugins, plugin API). Use for every implementation, refactoring or architecture question in this repository, especially when adding Markdown syntax, core plugins, views, commands or storage adapters.
---

# obsidian-web

Goal: reproduce Obsidian completely in the browser, fully compatible with existing vaults.
The detailed concept is in `docs/KONZEPT.md`. Read it before planning larger changes.

## Non-negotiable rules

1. **English only.** Everything you write from now on is English: code, comments, identifiers, test
   names, commit messages, branch names, PR titles and descriptions, issues and docs. When you open a
   file to change it, translate every German text you read in it (comments, strings, test names,
   prose) into English as part of that change. Files you only read stay as they are.
2. **Vault compatibility comes first.** Only write formats that Obsidian Desktop writes too:
   Markdown, YAML frontmatter, `.canvas` (JSON Canvas) and `.obsidian/*.json`. Do not introduce your
   own files or fields in the vault. Internal caches live in IndexedDB and must be rebuildable at any
   time.
3. **Name things after the Obsidian API.** Classes, methods and events are named as in
   `obsidian.d.ts` (`Vault.read`, `MetadataCache.getFileCache`, `Workspace.getLeaf`, event `rename` …).
   Before inventing a new name, check whether the Obsidian API already has one.
4. **Respect the layer boundaries.** Imports only go downwards:
   `app → plugins/api → ui/editor → markdown/core → storage/shared`.
   `core`, `markdown`, `storage` and `shared` do **not** touch the DOM, because they also run in the worker.
5. **Core plugins only use the public API.** A core plugin under `src/plugins/` must not import
   internals from `core/` or `ui/` that a community plugin would not have as well. If something is
   missing, extend the API.
6. **Clean room.** Only use the public docs and the MIT type definitions from `obsidian-api`. Do not
   copy code, CSS or assets from the Obsidian app.
7. **Keep Obsidian's DOM classes.** Rendered elements carry Obsidian's class names and CSS variables
   (`.markdown-rendered`, `.callout[data-callout]`, `.internal-link`, `--text-normal`,
   `--background-primary` …), so community themes work.
8. **Every feature gets its own branch.** Never work directly on `main`, see
   [Git workflow](#git-workflow).

## Git workflow

- **One branch per feature, created before the first change is written.** Create it from the current
  `main`: `git switch main && git pull && git switch -c feature/<short-name>`. The short name is
  kebab-case and describes the feature (`feature/tabs`, `feature/properties-view`).
- **Bug fixes** work the same way, with the prefix `fix/` (`fix/safari-nfd-paths`).
- **A branch contains exactly one feature.** If a second one comes up along the way, it goes into its
  own branch.
- **Parallel sessions** work in their own worktrees (`git worktree add ../obsidian-web-<short-name>
  -b feature/<short-name>`), so they do not overwrite each other's files.
- **Before merging**, `pnpm typecheck && pnpm lint && pnpm test` must be green. Merge only after the
  user approves.

## Project map

| Path | Responsibility |
|---|---|
| `src/shared/` | Path utils, `Events`, helpers without DOM |
| `src/storage/` | `DataAdapter` + `FsAccessAdapter`, `OpfsAdapter`, `MemoryAdapter` |
| `src/core/` | `App`, `Vault`, `MetadataCache` (+ `worker/`), `FileManager`, commands, config |
| `src/markdown/syntax/<element>/` | One `lezer.ts` per syntax element (shared parser for editor, reading view, embeds) |
| `src/markdown/sections.ts` | Sections and blocks for embeds (`#Heading`, `#^id`) |
| `src/editor/render/` | Renderers: reading view, embeds, callouts, tables, math, Mermaid |
| `src/markdown/metadata.ts` | `computeMetadata` → `CachedMetadata` (links, embeds, tags, headings, blocks, frontmatter) |
| `src/core/metadata-cache.ts` | Index of all notes, `resolvedLinks`, backlinks, link resolution; parses in the worker (`core/worker/`) |
| `src/core/file-manager.ts` | Rename/move with link updates (`alwaysUpdateLinks`) |
| `src/core/search.ts` | Search syntax and matches (pure, testable); UI in `src/ui/views/` |
| `src/markdown/render/` | `MarkdownRenderer`: AST → DOM |
| `src/editor/` | CodeMirror 6, Live Preview, `Editor` facade |
| `src/ui/` | Workspace tree, `WorkspaceLeaf`, `View`/`ItemView`, Modal, Menu, Notice, Setting |
| `src/plugins/<id>/` | One core plugin per folder, `index.ts` exports a `Plugin` class (the file explorer stays in `src/ui/file-explorer.ts` until phase 4) |
| `src/api/` | `obsidian.ts` (module for `require("obsidian")`), `plugin.ts`, `plugin-manager.ts`, `request-url.ts`, `platform.ts` |
| `src/app/app.ts` | `App`: connects vault, workspace, editor, explorer, settings, plugins |
| `server/cors-proxy.ts` | Vite middleware `/__proxy`: replacement for Electron's CORS-free `requestUrl` |
| `scripts/fetch-plugins.mjs` | Downloads bundled plugins (remotely-save) to `public/bundled-plugins/` |
| `e2e/` | Playwright tests (`*.e2e.ts`) in Chromium, Firefox, WebKit; helpers in `e2e/fixtures.ts`, fixture vault in `e2e/fixtures/vault/` (created with Obsidian Desktop, notes added for the tests) |
| `tests/fixtures/syntax/` | Syntax corpus: `name.md` + `name.html` + `name.cache.json` |

## Common tasks

### Adding new Markdown syntax

1. Write the Lezer extension in `src/markdown/syntax/<name>/lezer.ts`, register it in
   `syntax/index.ts` and test edge cases in `tests/markdown-syntax.test.ts`.
2. Live Preview: add a case in `src/editor/live-preview/decorations.ts` (multi-line blocks via
   `blockWidgetFor`), test in `tests/live-preview.test.ts`.
3. Renderer (reading view, embeds, callouts): add a case in `src/editor/render/`, test in
   `tests/render.test.ts`.
4. If the syntax produces metadata (link, tag, block …), extend `CachedMetadata`.

Always check the behaviour against the Obsidian help (help.obsidian.md) and, if possible, against the
desktop app. Edge cases like spaces in tags, nested callouts or links with `|` and `#` are the most
common sources of bugs.

There is **one** parser for everything (see `docs/KONZEPT.md` 3.3): Lezer extensions in
`src/markdown/syntax/*/lezer.ts` with tests in `tests/markdown-syntax.test.ts`. There is no micromark
side. Besides the parser and Live Preview, new syntax also needs a case in the renderer
(`src/editor/render/inline.ts` or `markdown.ts`, tests in `tests/render.test.ts`), otherwise it is
missing in the reading view and in embeds. Live Preview lives in `src/editor/live-preview/`: an
element shows its syntax as soon as the selection touches it; line markers like `#` and `>` show it
as soon as the cursor is on the line. New syntax needs a case in `decorations.ts` there and a test in
`tests/live-preview.test.ts`.

### New core plugin

1. Create `src/plugins/<id>/index.ts` with `export default class extends Plugin`; the ID matches
   Obsidian's core plugin ID (`file-explorer`, `backlink`, `graph` …).
2. Register views via `this.registerView`, commands via `this.addCommand`, events via
   `this.registerEvent`, so `onunload` cleans everything up automatically.
3. Add the plugin to the core plugin registry. Whether it is enabled is stored in
   `.obsidian/core-plugins.json`.
4. Write an E2E test that uses the plugin on the fixture vault.

### Getting a community plugin to run or extending the shim

1. Check the plugin's source: which exports from `obsidian` does it import? Watch out for multi-line
   imports. Which `app.*` and `vault.adapter.*` calls does it make, and which globals like
   `window.moment` or `createEl` does it use?
2. Add missing exports to `src/api/obsidian.ts`. Signature and behaviour follow `obsidian.d.ts`, not
   whatever the one plugin happens to need.
3. Never change the plugin itself. Always load the release build unchanged.
4. Cover the plugin with an integration test like `tests/remotely-save.test.ts` (happy-dom globals,
   Node `fetch`, `fake-indexeddb`).

remotely-save is the reference plugin. Every change to `storage/`, `core/vault.ts` or
`api/request-url.ts` must pass `tests/remotely-save.test.ts`. It is critical that
`writeBinary(…, { mtime })` returns exactly that `mtime` in `stat` and `TFile.stat`, otherwise the
sync re-uploads everything on every run.

### New command

Command IDs follow the scheme `<plugin-id>:<action>` (e.g. `editor:toggle-bold`). Use the same ID as
Obsidian, so hotkeys from `hotkeys.json` apply.

### New storage adapter

Implement the `DataAdapter` interface completely and run the shared adapter test suite
(`tests/storage/adapter.suite.ts`) against the new implementation. Paths are always vault-relative
and use `/`.

**Unicode:** paths from storage or sync keep their exact spelling in the adapter and in the vault.
Use `cleanPath` there, not `normalizePath`, which converts to NFC. Paths are found regardless of NFC
or NFD (`unicodeKey`). Backends may rewrite names, e.g. Safari's OPFS stores NFD. `scan` restores
the original spelling from the TimesStore. `normalizePath` is only meant for user input.

## Commands

```bash
pnpm install         # also downloads the bundled plugins via postinstall
pnpm dev             # dev server incl. CORS proxy (http://localhost:5173)
pnpm test            # Vitest: unit tests + remotely-save integration test
pnpm test:e2e        # Playwright: E2E tests in Chromium, Firefox, WebKit (starts the dev server itself)
pnpm typecheck       # tsc --noEmit
pnpm lint            # ESLint: layer boundaries and no DOM in core/markdown/storage/shared
pnpm build           # typecheck + production build
pnpm fetch-plugins   # re-download plugins (--force overwrites)
```

Before finishing a task, run `pnpm typecheck && pnpm lint && pnpm test`, and for UI changes also
`pnpm test:e2e`. ESLint lives with its own TypeScript 6 in the workspace package `tools/eslint/`,
because `@typescript-eslint/parser` needs the JS API that TypeScript 7 no longer has. The rules are
in `tools/eslint/config.js`.

### Writing an E2E test

Use `test` from `e2e/fixtures.ts`: the `vault` fixture provides a page with the fixture vault open,
`vaultName` its name (for `readVaultFile`). Every test has its own vault name, because WebKit shares
the OPFS between all profiles. After opening a file, wait with `expectOpen`, otherwise the test
checks the editor before the file is loaded. The fixture vault contains a placeholder manifest for
remotely-save, so its welcome dialog does not get in the way.

### New sidebar view

Extend `IndexView` (`src/ui/views/index-view.ts`): `refresh()` runs batched and only while the tab is
visible. Register the view in `App` via `addIndexView` in `leftSidebar` or `rightSidebar`. For
selection and navigation use `app.openFileAt(file, from, to)`.

## Conventions

- TypeScript strict, no `any` except in the `api/` shim, where the Obsidian types dictate it.
- File names in kebab-case, class names as in the Obsidian API.
- Release resources via `Component.register*`, not via your own cleanup lists.
- Write operations on files go exclusively through `Vault` or `FileManager`, never directly through the adapter.
- Long-running work like parsing or indexing belongs in the worker, not on the main thread.
- Larger architecture decisions are recorded as ADRs under `docs/adr/NNNN-title.md`.

## References

- Obsidian help (behaviour, syntax): https://help.obsidian.md
- Developer docs (API, plugins, themes): https://docs.obsidian.md
- API types: https://github.com/obsidianmd/obsidian-api (`obsidian.d.ts`)
- JSON Canvas: https://jsoncanvas.org
- CodeMirror 6: https://codemirror.net/docs/
