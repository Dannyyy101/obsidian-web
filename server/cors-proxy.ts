// Ersatz für Obsidians CORS-freies `requestUrl`: Die App schickt Requests an /__proxy,
// der Server führt sie aus und reicht Status, Header und Body unverändert zurück.
// Läuft im Vite-Dev- und Preview-Server. Nur auf localhost binden – das ist ein offener Proxy.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

export const PROXY_PATH = "/__proxy";
const TARGET_HEADER = "x-proxy-target";
// Die Header des eigentlichen Requests kommen als JSON, damit auch vom Browser gesperrte ankommen.
const HEADERS_HEADER = "x-proxy-headers";

// Header, die Node (undici) selbst setzt.
const DROP_REQUEST_HEADERS = new Set(["host", "connection", "content-length", "transfer-encoding"]);
const DROP_RESPONSE_HEADERS = new Set([
  "content-encoding", "content-length", "transfer-encoding", "connection", "set-cookie",
]);
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 20;

async function readBody(req: IncomingMessage): Promise<Uint8Array<ArrayBuffer> | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return chunks.length ? new Uint8Array(Buffer.concat(chunks)) : undefined;
}

/** Leere Liste bedeutet: alle Hosts erlaubt. */
function isAllowed(url: URL, allowedHosts: string[]) {
  return !allowedHosts.length || allowedHosts.includes(url.hostname.toLowerCase());
}

/**
 * Führt den Request aus und folgt Weiterleitungen selbst, damit `allowedHosts` auch für jedes
 * Weiterleitungsziel gilt. Sonst käme man über einen Redirect an jeden Host im internen Netz.
 */
export async function handleProxyRequest(req: IncomingMessage, res: ServerResponse, allowedHosts: string[] = []) {
  const target = req.headers[TARGET_HEADER];
  if (typeof target !== "string" || !/^https?:\/\//.test(target) || !URL.canParse(target)) {
    res.statusCode = 400;
    res.end(`missing or invalid ${TARGET_HEADER} header`);
    return;
  }

  const headers = new Headers();
  try {
    const raw = req.headers[HEADERS_HEADER];
    const requested: Record<string, string> = typeof raw === "string" ? JSON.parse(decodeURIComponent(raw)) : {};
    for (const [key, value] of Object.entries(requested)) {
      if (!DROP_REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value);
    }
  } catch {
    res.statusCode = 400;
    res.end(`invalid ${HEADERS_HEADER} header`);
    return;
  }

  let url = new URL(target);
  let method = req.method ?? "GET";
  let body = method === "GET" || method === "HEAD" ? undefined : await readBody(req);
  try {
    let upstream: Response;
    for (let redirects = 0; ; redirects++) {
      if (!isAllowed(url, allowedHosts)) {
        res.statusCode = 403;
        res.end(`proxy target not allowed: ${url.hostname} (PROXY_ALLOWED_HOSTS)`);
        return;
      }
      upstream = await fetch(url, { method, headers, body, redirect: "manual" });
      const location = upstream.headers.get("location");
      if (!REDIRECT_STATUS.has(upstream.status) || location === null) break;
      await upstream.body?.cancel();
      if (redirects === MAX_REDIRECTS) throw new Error("too many redirects");
      const next = new URL(location, url);
      if (next.protocol !== "http:" && next.protocol !== "https:") throw new Error(`redirect to ${next.protocol} not allowed`);
      // Wie fetch: 303 und POST bei 301/302 werden zu GET ohne Body, Zugangsdaten nur an dasselbe Origin.
      if ((upstream.status === 303 && method !== "HEAD") || (upstream.status <= 302 && method === "POST")) {
        method = "GET";
        body = undefined;
        headers.delete("content-type");
      }
      if (next.origin !== url.origin) headers.delete("authorization");
      url = next;
    }
    res.statusCode = upstream.status;
    upstream.headers.forEach((value, key) => {
      if (!DROP_RESPONSE_HEADERS.has(key)) res.setHeader(key, value);
    });
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    res.statusCode = 502;
    res.setHeader("x-proxy-error", "1");
    res.end(String(err));
  }
}

export function corsProxy(): Plugin {
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url?.split("?")[0] !== PROXY_PATH) return next();
    void handleProxyRequest(req, res);
  };
  return {
    name: "obsidian-web-cors-proxy",
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
}
