// Entspricht Obsidians `requestUrl` / `request`: HTTP ohne CORS-Beschränkung. Im Browser geht das
// nur über einen Proxy (server/cors-proxy.ts). Ohne Proxy wird direkt per fetch angefragt.
const PROXY_URL: string | undefined = import.meta.env.VITE_CORS_PROXY ?? "/__proxy";

export interface RequestUrlParam {
  url: string;
  method?: string;
  contentType?: string;
  body?: string | ArrayBuffer;
  headers?: Record<string, string>;
  throw?: boolean;
}

export interface RequestUrlResponse {
  status: number;
  headers: Record<string, string>;
  arrayBuffer: ArrayBuffer;
  json: any;
  text: string;
}

export type RequestUrlResponsePromise = Promise<RequestUrlResponse> & {
  arrayBuffer: Promise<ArrayBuffer>;
  json: Promise<any>;
  text: Promise<string>;
};

async function send(param: RequestUrlParam): Promise<RequestUrlResponse> {
  const headers: Record<string, string> = { ...param.headers };
  if (param.contentType) headers["content-type"] = param.contentType;
  const init: RequestInit = { method: param.method ?? "GET", body: param.body };

  // Alle Header als JSON übergeben, damit auch vom Browser gesperrte (Host, Content-Length …)
  // beim Ziel ankommen – S3-Signaturen hängen davon ab.
  const res = PROXY_URL
    ? await fetch(PROXY_URL, {
        ...init,
        headers: { "x-proxy-target": param.url, "x-proxy-headers": encodeURIComponent(JSON.stringify(headers)) },
      })
    : await fetch(param.url, { ...init, headers });
  if (res.headers.get("x-proxy-error")) throw new Error(`net::ERR_FAILED ${await res.text()}`);

  const arrayBuffer = await res.arrayBuffer();
  const responseHeaders: Record<string, string> = {};
  res.headers.forEach((value, key) => (responseHeaders[key] = value));
  let text: string | undefined;
  const response: RequestUrlResponse = {
    status: res.status,
    headers: responseHeaders,
    arrayBuffer,
    get text() {
      return (text ??= new TextDecoder().decode(arrayBuffer));
    },
    get json() {
      return JSON.parse(this.text);
    },
  };

  if (res.status >= 400 && param.throw !== false) {
    const err = new Error(`Request failed, status ${res.status}`) as Error & Partial<RequestUrlResponse>;
    Object.assign(err, { status: res.status, headers: responseHeaders, text: response.text });
    throw err;
  }
  return response;
}

export function requestUrl(request: RequestUrlParam | string): RequestUrlResponsePromise {
  const promise = send(typeof request === "string" ? { url: request } : request);
  // Erst beim Zugriff auswerten: `json` würde sonst bei jeder Nicht-JSON-Antwort fehlschlagen.
  return Object.defineProperties(promise, {
    arrayBuffer: { get: () => promise.then((r) => r.arrayBuffer) },
    json: { get: () => promise.then((r) => r.json) },
    text: { get: () => promise.then((r) => r.text) },
  }) as RequestUrlResponsePromise;
}

export async function request(req: RequestUrlParam | string): Promise<string> {
  return (await requestUrl(req)).text;
}
