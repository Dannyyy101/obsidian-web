// Produktions-Server: liefert den Vite-Build aus `dist/` aus und stellt den CORS-Proxy unter
// /__proxy bereit. Läuft ohne Abhängigkeiten direkt mit Node (Type-Stripping, Node >= 22.18).
// Der Proxy ist offen – den Server nie direkt ins Internet stellen, sondern nur hinter einer
// Anmeldung (siehe deploy/docker-compose.yml mit oauth2-proxy und Zitadel).
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { handleProxyRequest, PROXY_PATH } from "./cors-proxy.ts";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const ROOT = resolve(process.env.DIST_DIR ?? "dist");
// Pflicht: kommagetrennte Liste erlaubter Ziel-Hosts für den Proxy, z. B. "s3.example.com,dav.example.com".
// Sie gilt auch für jedes Weiterleitungsziel. "*" erlaubt bewusst alle Hosts, auch im internen Netz.
const ALLOWED_HOSTS = (process.env.PROXY_ALLOWED_HOSTS ?? "")
  .split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
if (!ALLOWED_HOSTS.length) {
  console.error("PROXY_ALLOWED_HOSTS fehlt: Hosts für /__proxy angeben (z. B. s3.example.com) oder \"*\" für alle.");
  process.exit(1);
}
const PROXY_HOSTS = ALLOWED_HOSTS.includes("*") ? [] : ALLOWED_HOSTS;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
};

function serveFile(res: ServerResponse, file: string, immutable: boolean) {
  res.statusCode = 200;
  res.setHeader("content-type", MIME[extname(file).toLowerCase()] ?? "application/octet-stream");
  // Vite versieht alles unter /assets/ mit einem Hash, index.html muss dagegen immer frisch sein.
  res.setHeader("cache-control", immutable ? "public, max-age=31536000, immutable" : "no-cache");
  createReadStream(file).pipe(res);
}

async function serveStatic(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.end();
    return;
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  } catch {
    res.statusCode = 400;
    res.end();
    return;
  }
  const file = normalize(join(ROOT, pathname));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) {
    res.statusCode = 403;
    res.end();
    return;
  }
  const info = await stat(file).catch(() => undefined);
  if (info?.isFile()) return serveFile(res, file, pathname.startsWith("/assets/"));
  // Fehlende Dateien mit Endung sind echte 404, alles andere ist eine App-Route.
  if (extname(pathname)) {
    res.statusCode = 404;
    res.end();
    return;
  }
  return serveFile(res, join(ROOT, "index.html"), false);
}

const server = createServer((req, res) => {
  const pathname = req.url?.split("?")[0];
  if (pathname === "/healthz") {
    res.end("ok");
    return;
  }
  if (pathname === PROXY_PATH) {
    void handleProxyRequest(req, res, PROXY_HOSTS);
    return;
  }
  void serveStatic(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) res.statusCode = 500;
    res.end();
  });
});

server.listen(PORT, HOST, () => console.log(`obsidian-web listening on http://${HOST}:${PORT}`));
