import { createElement, icons } from "lucide";

// Eigene Icons (addIcon) haben wie in Obsidian eine viewBox von 0 0 100 100.
const customIcons = new Map<string, string>();

export function addIcon(iconId: string, svgContent: string): void {
  customIcons.set(iconId, svgContent);
}

export function removeIcon(iconId: string): void {
  customIcons.delete(iconId);
}

function pascalCase(id: string): string {
  return id.replace(/^lucide-/, "").replace(/(^|-)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase());
}

export function getIcon(iconId: string): SVGSVGElement | null {
  const custom = customIcons.get(iconId);
  if (custom !== undefined) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.innerHTML = custom;
    svg.classList.add("svg-icon", iconId);
    return svg;
  }
  const node = (icons as Record<string, Parameters<typeof createElement>[0]>)[pascalCase(iconId)];
  if (!node) return null;
  const svg = createElement(node) as SVGSVGElement;
  svg.classList.add("svg-icon", `lucide-${iconId.replace(/^lucide-/, "")}`);
  return svg;
}

export function setIcon(parent: HTMLElement, iconId: string): void {
  parent.empty();
  const svg = getIcon(iconId);
  if (svg) parent.appendChild(svg);
}

export function getIconIds(): string[] {
  return [...customIcons.keys(), ...Object.keys(icons).map((k) => k.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase())];
}
