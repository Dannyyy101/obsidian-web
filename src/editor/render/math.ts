import type KaTeX from "katex";

type Katex = typeof KaTeX;

let katex: Katex | null = null;
let loading: Promise<Katex> | null = null;

/** KaTeX samt CSS und mhchem (`\ce{…}`) erst laden, wenn die erste Formel gebraucht wird. */
export function loadKatex(): Promise<Katex> {
  loading ??= Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(async ([mod]) => {
    katex = mod.default;
    await import("katex/contrib/mhchem");
    return katex;
  });
  return loading;
}

/**
 * Wie Obsidian: Darstellung so nachsichtig wie möglich, Fehler als rote Quelle statt Exception.
 * MathJax' `\class{…}{…}` (in Obsidian verfügbar) wird zu KaTeX' `\htmlClass`; nur das ist vertraut.
 */
function renderInto(k: Katex, tex: string, el: HTMLElement, display: boolean) {
  try {
    k.render(tex, el, {
      displayMode: display,
      throwOnError: false,
      strict: false,
      trust: (ctx) => ctx.command === "\\htmlClass",
      macros: { "\\class": "\\htmlClass" },
      output: "htmlAndMathml",
    });
  } catch (err) {
    el.setText(tex);
    el.addClass("math-error");
    el.setAttr("title", err instanceof Error ? err.message : String(err));
  }
}

/** Rendert eine Formel; synchron, sobald KaTeX geladen ist, sonst nach dem Laden. */
export function renderMath(tex: string, display: boolean): HTMLElement {
  const el = display ? createDiv({ cls: ["math", "math-block"] }) : createSpan({ cls: ["math", "math-inline"] });
  if (katex) renderInto(katex, tex, el, display);
  else {
    el.setText(tex);
    el.addClass("is-loading");
    void loadKatex().then((k) => {
      el.removeClass("is-loading");
      el.empty();
      renderInto(k, tex, el, display);
    });
  }
  return el;
}

/** Formelquelle ohne `$`/`$$`-Begrenzer. */
export function mathSource(text: string): { tex: string; display: boolean } {
  const display = text.startsWith("$$");
  const n = display ? 2 : 1;
  const end = text.endsWith(display ? "$$" : "$") && text.length >= 2 * n ? text.length - n : text.length;
  return { tex: text.slice(n, end).trim(), display };
}
