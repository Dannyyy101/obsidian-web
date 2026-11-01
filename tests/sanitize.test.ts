// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { sanitizeHTMLToDom } from "../src/api/markdown-renderer";
import { resourceUrl } from "../src/editor/live-preview/host";

function sanitize(html: string) {
  const el = document.createElement("div");
  el.append(sanitizeHTMLToDom(html));
  return el;
}

describe("sanitizeHTMLToDom", () => {
  it("entfernt Skripte, Event-Handler und gefährliche Elemente", () => {
    const el = sanitize('<b onclick="x()">fett</b><script>x()</script><iframe src="https://a"></iframe><svg><script>x()</script></svg>');
    expect(el.innerHTML).toBe("<b>fett</b><svg></svg>");
  });

  it("behält sichere und relative URLs", () => {
    const el = sanitize('<a href="https://example.com">a</a><a href="mailto:a@b.de">b</a><a href="#teil">c</a><img src="bild.png">');
    expect([...el.querySelectorAll("[href], [src]")].map((e) => e.getAttribute("href") ?? e.getAttribute("src")))
      .toEqual(["https://example.com", "mailto:a@b.de", "#teil", "bild.png"]);
  });

  it.each([
    "javascript:x()",
    " JavaScript:x()",
    "jav&#x09;ascript:x()",
    "java&#x0A;script:x()",
    "&#x01;javascript:x()",
    "vbscript:x()",
    "data:text/html,<script>x()</script>",
  ])("entfernt die unsichere URL %s", (url) => {
    const el = sanitize(`<a href="${url}">a</a><img src="${url}">`);
    expect(el.querySelector("[href], [src]")).toBeNull();
  });

  it("entfernt SVG-Animationen, die href nachträglich setzen könnten", () => {
    const el = sanitize('<svg><a><animate attributeName="href" values="javascript:x()"/><set attributeName="href" to="javascript:x()"/><text>t</text></a></svg>');
    expect(el.querySelector("animate, set")).toBeNull();
    expect(el.querySelector("text")?.textContent).toBe("t");
  });
});

describe("resourceUrl", () => {
  it("liefert SVGs als data:-URL, die ein eigenes Origin hat", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>ä</text></svg>';
    const url = resourceUrl(new TextEncoder().encode(svg).buffer, "svg");
    expect(url.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(url.slice(url.indexOf(",") + 1))).toBe(svg);
  });

  it("liefert andere Dateien als Blob-URL", () => {
    expect(resourceUrl(new Uint8Array([1, 2]).buffer, "png").startsWith("blob:")).toBe(true);
  });
});
