# obsidian-web

A browser implementation of [Obsidian](https://obsidian.md). Open an existing vault, edit it in the
browser, and keep using it in Obsidian Desktop afterwards without any difference.

> **Status:** early development (v0.1.0). The user interface is currently German only. See
> [docs/ROADMAP.md](docs/ROADMAP.md) for what works, what is partial and what is missing.

## Principles

- **The vault is the source of truth.** Notes and attachments stay plain Markdown files, settings
  stay in `.obsidian/`. Caches (IndexedDB) can be discarded and rebuilt at any time.
- **Compatible in both directions.** Whatever obsidian-web writes, Obsidian Desktop can read, and
  vice versa: Markdown syntax, frontmatter, `workspace.json`, `app.json` and more.
- **Local-first.** Runs without a server. A server is only needed for the CORS proxy used by sync
  plugins.
- **Obsidian-shaped API.** Internal classes follow the public Obsidian API (`App`, `Vault`, `TFile`,
  `MetadataCache`, `Workspace`, `Plugin` …), so community plugins can run on an `obsidian` module shim.
- **Clean room.** Built only from public sources (help.obsidian.md, docs.obsidian.md and the
  MIT-licensed `obsidian-api` type definitions). No proprietary code or assets.

## Features

- **Vault:** stored in the browser (OPFS), multiple vaults, file explorer with create, rename and
  delete (`.trash`), link updates on rename and move
- **Editor:** CodeMirror 6 with Live Preview, source mode and reading mode, inline title, list
  continuation and indentation, auto-pairing, `[[link]]` and `#tag` suggestions
- **Markdown:** wikilinks with headings, blocks and aliases, embeds (notes, sections, blocks, images,
  audio, video, PDF), callouts, tags, `==highlights==`, `%%comments%%`, tables, LaTeX (KaTeX +
  mhchem), Mermaid
- **Navigation:** tabs, quick switcher, command palette, search, backlinks (including unlinked
  mentions), outgoing links, outline, global and local graph
- **Plugins:** unmodified community plugins loaded from `.obsidian/plugins/`. Tested with
  [remotely-save](https://github.com/remotely-save/remotely-save) (sync via WebDAV, S3, Dropbox,
  OneDrive), [Latex Suite](https://github.com/artisticat1/obsidian-latex-suite) and
  [Omnisearch](https://github.com/scambier/obsidian-omnisearch)

Not planned: Obsidian Sync and Publish, and plugins that depend on Node or Electron APIs.

## Getting started

Requirements: Node.js 24 and pnpm 10.

```sh
pnpm install   # also downloads the bundled plugins (see below)
pnpm dev       # start the Vite dev server
```

### Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Dev server with hot reload and CORS proxy |
| `pnpm build` | Typecheck and production build into `dist/` |
| `pnpm start` | Serve `dist/` with the production server (`server/prod.ts`) |
| `pnpm typecheck` | TypeScript check only |
| `pnpm test` | Unit and integration tests (Vitest, happy-dom) |
| `pnpm test:e2e` | End-to-end tests (Playwright: Chromium, Firefox, WebKit) |
| `pnpm fetch-plugins` | Download the bundled plugins again (`--force` to overwrite) |

### Bundled plugins

`scripts/fetch-plugins.mjs` downloads release builds of remotely-save, Latex Suite and Omnisearch
into `public/bundled-plugins/`. They are not checked in and not baked into the Docker image, because
remotely-save contains code under the PolyForm Strict license. The container downloads them at
startup instead.

## Deployment

The production server serves the build and exposes a CORS proxy at `/__proxy` for plugin requests
(for example sync). **The proxy is open, so never expose the server to the internet without
authentication in front of it.**

[deploy/docker-compose.yml](deploy/docker-compose.yml) runs obsidian-web behind
[oauth2-proxy](https://oauth2-proxy.github.io/oauth2-proxy/) with Zitadel as the OIDC provider:

```sh
cd deploy
cp .env.example .env   # fill in the values
docker compose up -d --build
```

| Variable | Description |
|---|---|
| `PUBLIC_HOST` | Public domain of the app (without `https://`) |
| `ZITADEL_ISSUER`, `ZITADEL_CLIENT_ID`, `ZITADEL_CLIENT_SECRET` | OIDC app in Zitadel, redirect URI `https://<PUBLIC_HOST>/oauth2/callback` |
| `COOKIE_SECRET` | 32 random bytes for the session cookie |
| `PROXY_ALLOWED_HOSTS` | Required comma-separated allowlist of hosts the proxy may reach (also checked for redirects); `*` allows all hosts. The server refuses to start without it |

## Project structure

```
src/
  app/        bootstrapping, settings, appearance
  api/        obsidian module shim and plugin loader
  ui/         workspace, views, modals, menus
  editor/     CodeMirror 6, Live Preview, reading-mode renderer
  markdown/   Lezer parser extensions for Obsidian syntax, metadata extraction
  core/       Vault, MetadataCache, FileManager, commands, search, graph
  storage/    data adapters (OPFS, memory) and IndexedDB stores
  shared/     paths, events, utilities (no DOM)
server/       production server and CORS proxy
tests/        Vitest tests
e2e/          Playwright tests and fixture vault
docs/         concept and roadmap (German)
```

Each layer may only import layers listed below it. The architecture is described in detail in
[docs/KONZEPT.md](docs/KONZEPT.md).
