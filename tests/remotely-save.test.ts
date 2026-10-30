// Integrationstest: Das unveränderte remotely-save (Release-Build) synchronisiert zwei obsidian-web-
// Vaults über einen lokalen WebDAV-Server – mit allen Requests über unseren CORS-Proxy.
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { IDBFactory } from "fake-indexeddb";
import { Window } from "happy-dom";
import { v2 as webdav } from "webdav-server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { handleProxyRequest } from "../server/cors-proxy";

const PLUGIN_DIR = "public/bundled-plugins/remotely-save";
const REMOTE_DIR = "Testvault";
const hasPlugin = existsSync(`${PLUGIN_DIR}/main.js`);

let webdavServer: webdav.WebDAVServer;
let proxy: Server;
let webdavUrl = "";
/** Schreibende Requests am WebDAV-Server (PUT, DELETE, MKCOL, MOVE …). */
let remoteWrites = 0;

// Browser-Globals aus happy-dom, aber Nodes echtes fetch (ohne CORS).
function installBrowserGlobals() {
  const win = new Window({ url: "http://localhost/" });
  const nodeFetch = globalThis.fetch;
  Object.assign(win, { fetch: nodeFetch });
  const g = globalThis as any;
  // Alles übernehmen, was Node nicht selbst hat (DOM-Klassen, document, localStorage …).
  for (const key of Object.getOwnPropertyNames(win)) {
    if (!(key in g)) g[key] = (win as any)[key];
  }
  g.window = win;
  g.indexedDB = new IDBFactory();
  (win as any).indexedDB = g.indexedDB;
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

/**
 * Ein frischer obsidian-web-Vault mit installiertem und konfiguriertem remotely-save. Beide
 * "Geräte" teilen sich eine IndexedDB; remotely-save trennt seinen Sync-Verlauf nach Vault-Namen.
 */
async function createVault(name: string) {
  const { Vault } = await import("../src/core/vault");
  const { IndexedAdapter } = await import("../src/storage/indexed-adapter");
  const { MemoryBackend, MemoryTimesStore } = await import("../src/storage/memory-backend");
  const { App } = await import("../src/app/app");

  const adapter = new IndexedAdapter(name, new MemoryBackend(), new MemoryTimesStore());
  for (const file of ["manifest.json", "main.js", "styles.css"]) {
    await adapter.write(`.obsidian/plugins/remotely-save/${file}`, readFileSync(`${PLUGIN_DIR}/${file}`, "utf8"));
  }
  await adapter.write(".obsidian/community-plugins.json", JSON.stringify(["remotely-save"]));
  await adapter.write(
    ".obsidian/plugins/remotely-save/data.json",
    JSON.stringify({
      serviceType: "webdav",
      webdav: { address: webdavUrl, username: "", password: "", authType: "basic", manualRecursive: true, depth: "manual_1", remoteBaseDir: REMOTE_DIR },
      agreeToUseSyncV3: true,
      protectModifyPercentage: 100, // Schutz des Plugins greift sonst bei nur zwei Testdateien
      currLogLevel: "info",
    }),
  );

  const vault = new Vault(adapter);
  await vault.load();
  const root = document.createElement("div");
  document.body.appendChild(root);
  const app = new App(vault, root);
  await app.plugins.loadEnabled();
  app.workspace.setLayoutReady();
  const plugin = app.plugins.getPlugin("remotely-save") as any;
  return { app, vault, adapter, sync: () => plugin.syncRun("manual") as Promise<void> };
}

describe.skipIf(!hasPlugin)("remotely-save in obsidian-web", () => {
  beforeAll(async () => {
    installBrowserGlobals();
    const { installDomExtensions } = await import("../src/ui/dom");
    installDomExtensions();

    webdavServer = new webdav.WebDAVServer({ port: 0 });
    const davHttp = createServer((req, res) => {
      if (!["GET", "HEAD", "PROPFIND", "OPTIONS"].includes(req.method ?? "")) remoteWrites++;
      webdavServer.executeRequest(req, res);
    });
    webdavUrl = `http://127.0.0.1:${await listen(davHttp)}`;

    proxy = createServer((req, res) => {
      if (req.url?.startsWith("/__proxy")) void handleProxyRequest(req, res);
      else res.writeHead(404).end();
    });
    vi.stubEnv("VITE_CORS_PROXY", `http://127.0.0.1:${await listen(proxy)}/__proxy`);
  });

  afterAll(() => {
    proxy?.close();
    vi.unstubAllEnvs();
  });

  it("synchronisiert Anlegen, Ändern und Löschen zwischen zwei Geräten", async () => {
    const a = await createVault("Gerät A");
    await a.vault.create("Hallo.md", "# Hallo von Gerät A");
    await a.vault.createFolder("Projekte");
    await a.vault.create("Projekte/Plan.md", "- [ ] Sync testen");
    await a.sync();

    const b = await createVault("Gerät B");
    await b.sync();
    expect(await b.vault.read(b.vault.getFileByPath("Hallo.md")!)).toBe("# Hallo von Gerät A");
    const planB = b.vault.getFileByPath("Projekte/Plan.md")!;
    expect(await b.vault.read(planB)).toBe("- [ ] Sync testen");
    expect(planB.stat.mtime).toBeGreaterThan(0);

    // Zweiter Lauf ohne Änderungen darf nichts verändern. Das schlägt fehl, wenn der Adapter die
    // vom Plugin gesetzten mtimes nicht exakt zurückliefert (WebDAV: mtime = Upload-Zeit des Servers).
    const before = b.vault.getFiles().map((f) => [f.path, f.stat.mtime]);
    const writesBefore = remoteWrites;
    await b.sync();
    expect(b.vault.getFiles().map((f) => [f.path, f.stat.mtime])).toEqual(before);
    expect(remoteWrites).toBe(writesBefore);

    await new Promise((r) => setTimeout(r, 1100));
    await b.vault.modify(planB, "- [x] Sync testen");
    await b.vault.trash(b.vault.getFileByPath("Hallo.md")!, true);
    await b.sync();

    await a.sync();
    expect(await a.vault.read(a.vault.getFileByPath("Projekte/Plan.md")!)).toBe("- [x] Sync testen");
    expect(a.vault.getFileByPath("Hallo.md")).toBeNull();
  }, 60_000);
});
