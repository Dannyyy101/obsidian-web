import { setIcon } from "../../ui/icons";

const CALLOUT_HEADER = /^\[!([^\]\s]+)\]([+-]?)[ \t]*(.*)$/;

/** Icon je Callout-Typ und Alias, wie in Obsidian. Farben stehen im CSS ([data-callout]). */
const ICONS: [string[], string][] = [
  [["note"], "pencil"],
  [["abstract", "summary", "tldr"], "clipboard-list"],
  [["info"], "info"],
  [["todo"], "circle-check"],
  [["tip", "hint", "important"], "flame"],
  [["success", "check", "done"], "check"],
  [["question", "help", "faq"], "circle-help"],
  [["warning", "caution", "attention"], "triangle-alert"],
  [["failure", "fail", "missing"], "x"],
  [["danger", "error"], "zap"],
  [["bug"], "bug"],
  [["example"], "list"],
  [["quote", "cite"], "quote"],
];

function iconFor(type: string): string {
  return ICONS.find(([names]) => names.includes(type))?.[1] ?? "pencil";
}

export interface Callout {
  type: string;
  /** "" = nicht einklappbar, "+" = aufgeklappt, "-" = eingeklappt */
  fold: "" | "+" | "-";
  title: string;
  body: string;
}

/** Eine Zitat-Ebene entfernen (`> ` am Zeilenanfang). */
function unquote(source: string): string[] {
  return source.split("\n").map((line) => line.replace(/^\s*>[ \t]?/, ""));
}

/** Erkennt `> [!typ]± Titel` und liefert Kopf und Inhalt (ohne Zitatzeichen), sonst null. */
export function parseCallout(blockquoteSource: string): Callout | null {
  const [first, ...rest] = unquote(blockquoteSource);
  const m = CALLOUT_HEADER.exec(first.trim());
  if (!m) return null;
  const type = m[1].toLowerCase();
  return {
    type,
    fold: m[2] as Callout["fold"],
    title: m[3] || type.charAt(0).toUpperCase() + type.slice(1),
    body: rest.join("\n"),
  };
}

/**
 * Callout-DOM wie in Obsidian. Titel und Inhalt rendert der Aufrufer (`renderTitle`/`renderBody`),
 * damit Callouts Markdown, verschachtelte Callouts und Embeds enthalten können.
 */
export function renderCalloutShell(
  callout: Callout,
  parent: HTMLElement,
  renderTitle: (el: HTMLElement, title: string) => void,
  renderBody: (el: HTMLElement, body: string) => void,
): HTMLElement {
  const collapsible = callout.fold !== "";
  const el = parent.createDiv({
    cls: ["callout", ...(collapsible ? ["is-collapsible"] : []), ...(callout.fold === "-" ? ["is-collapsed"] : [])],
    attr: { "data-callout": callout.type, "data-callout-fold": callout.fold || null },
  });
  const titleEl = el.createDiv("callout-title");
  setIcon(titleEl.createDiv("callout-icon"), iconFor(callout.type));
  renderTitle(titleEl.createDiv("callout-title-inner"), callout.title);
  if (collapsible) {
    const fold = titleEl.createDiv("callout-fold");
    setIcon(fold, "chevron-down");
    titleEl.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      el.toggleClass("is-collapsed", !el.hasClass("is-collapsed"));
    });
  }
  if (callout.body.trim()) renderBody(el.createDiv("callout-content"), callout.body);
  return el;
}
