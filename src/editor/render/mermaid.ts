import type MermaidAPI from "mermaid";

let mermaid: Promise<typeof MermaidAPI> | null = null;
let counter = 0;

/** Mermaid ist groß (mehrere MB) und wird erst beim ersten Diagramm geladen. */
function loadMermaid() {
  mermaid ??= import("mermaid").then((m) => m.default);
  return mermaid;
}

/** Rendert ein Mermaid-Diagramm in `el`; Fehler werden als Quelltext mit Meldung gezeigt. */
export function renderMermaid(source: string, el: HTMLElement): void {
  el.addClass("mermaid");
  el.setText("Diagramm wird geladen …");
  void loadMermaid().then(async (m) => {
    const dark = document.body.hasClass("theme-dark");
    m.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: dark ? "dark" : "default",
      fontFamily: getComputedStyle(document.body).getPropertyValue("--font-text") || undefined,
    });
    try {
      const { svg } = await m.render(`mermaid-${++counter}`, source);
      el.innerHTML = svg; // mit securityLevel "strict" von Mermaid bereinigt
    } catch (err) {
      el.empty();
      el.addClass("mermaid-error");
      el.createEl("pre", { text: source });
      el.createDiv({ cls: "mermaid-error-message", text: err instanceof Error ? err.message : String(err) });
    }
  });
}
