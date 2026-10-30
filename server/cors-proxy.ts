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

async function readBody(req: IncomingMessage): Promise<Uint8Array<ArrayBuffer> | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return chunks.length ? new Uint8Array(Buffer.concat(chunks)) : undefined;
}

export async function handleProxyRequest(req: IncomingMessage, res: ServerResponse) {
  const target = req.headers[TARGET_HEADER];
  if (typeof target !== "string" || !/^https?:\/\//.test(target)) {
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

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req),
      redirect: "follow",
    });
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
