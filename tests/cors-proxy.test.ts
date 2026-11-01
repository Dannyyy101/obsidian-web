import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleProxyRequest } from "../server/cors-proxy";

const servers: Server[] = [];

async function listen(handler: RequestListener): Promise<number> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

let upstream: number;
let open: number;
let restricted: number;

beforeAll(async () => {
  upstream = await listen((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/redirect") {
      res.writeHead(Number(url.searchParams.get("status") ?? 302), { location: url.searchParams.get("to") ?? url.pathname });
      res.end();
      return;
    }
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => res.end(JSON.stringify({ method: req.method, path: url.pathname, body, auth: req.headers.authorization ?? null })));
  });
  open = await listen((req, res) => void handleProxyRequest(req, res));
  restricted = await listen((req, res) => void handleProxyRequest(req, res, ["127.0.0.1"]));
});

afterAll(() => servers.forEach((s) => s.close()));

function proxy(port: number, target: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) {
  return fetch(`http://127.0.0.1:${port}/__proxy`, {
    method: init.method,
    body: init.body,
    headers: { "x-proxy-target": target, "x-proxy-headers": encodeURIComponent(JSON.stringify(init.headers ?? {})) },
  });
}

describe("CORS-Proxy", () => {
  it("lehnt Ziele außerhalb der Allowlist ab", async () => {
    const res = await proxy(restricted, `http://localhost:${upstream}/`);
    expect(res.status).toBe(403);
  });

  it("folgt Weiterleitungen innerhalb der Allowlist", async () => {
    const res = await proxy(restricted, `http://127.0.0.1:${upstream}/redirect?to=/ziel`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ path: "/ziel" });
  });

  it("prüft auch Weiterleitungsziele gegen die Allowlist", async () => {
    const to = encodeURIComponent(`http://localhost:${upstream}/intern`);
    const res = await proxy(restricted, `http://127.0.0.1:${upstream}/redirect?to=${to}`);
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("localhost");
  });

  it("macht wie fetch aus POST nach 303 ein GET ohne Body", async () => {
    const res = await proxy(open, `http://127.0.0.1:${upstream}/redirect?status=303&to=/ziel`, { method: "POST", body: "daten" });
    expect(await res.json()).toMatchObject({ method: "GET", body: "" });
  });

  it("behält Methode und Body bei 307", async () => {
    const res = await proxy(open, `http://127.0.0.1:${upstream}/redirect?status=307&to=/ziel`, { method: "PUT", body: "daten" });
    expect(await res.json()).toMatchObject({ method: "PUT", body: "daten" });
  });

  it("schickt Authorization nicht an ein anderes Origin weiter", async () => {
    const headers = { authorization: "Bearer geheim" };
    const same = await proxy(open, `http://127.0.0.1:${upstream}/redirect?to=/ziel`, { headers });
    expect(await same.json()).toMatchObject({ auth: "Bearer geheim" });
    const to = encodeURIComponent(`http://localhost:${upstream}/ziel`);
    const other = await proxy(open, `http://127.0.0.1:${upstream}/redirect?to=${to}`, { headers });
    expect(await other.json()).toMatchObject({ auth: null });
  });

  it("bricht Weiterleitungsschleifen ab", async () => {
    const res = await proxy(open, `http://127.0.0.1:${upstream}/redirect?to=/redirect`);
    expect(res.status).toBe(502);
    expect(await res.text()).toContain("too many redirects");
  });
});
