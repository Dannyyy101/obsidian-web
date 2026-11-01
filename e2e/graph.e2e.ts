import type { Page } from "@playwright/test";
import { expect, expectOpen, openFromExplorer, openVault, readFixtureVault, readVaultFile, seedVault, test } from "./fixtures";

interface GraphNode {
  id: string;
  x: number;
  y: number;
}
interface GraphRenderer {
  canvas: HTMLCanvasElement;
  nodes: GraphNode[];
  focusedId: string | null;
  nodeColor(node: GraphNode): string | null;
  simulation: { alpha: number };
  toScreen(x: number, y: number): [number, number];
}
interface GraphWindow {
  app: {
    workspace: { getLeavesOfType(type: string): { view: { renderer: GraphRenderer } }[] };
    rightSidebar: { getView(id: string): { renderer: GraphRenderer } | undefined };
  };
}
type Which = "global" | "local";

/**
 * Der Graph zeichnet auf ein Canvas, deshalb lesen die Tests die Knoten über `window.app` aus.
 * Liefert je Knoten ID (NFC, WebKit legt Namen im OPFS als NFD ab), Farbe aus Farbgruppen und ob
 * er hervorgehoben ist.
 */
function graphNodes(page: Page, which: Which) {
  return page.evaluate((which) => {
    const { app } = window as unknown as GraphWindow;
    const renderer = which === "global" ? app.workspace.getLeavesOfType("graph")[0]?.view.renderer : app.rightSidebar.getView("localgraph")?.renderer;
    if (!renderer) return [];
    return renderer.nodes
      .map((n) => ({ id: n.id.normalize("NFC"), color: renderer.nodeColor(n), focused: n.id === renderer.focusedId }))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }, which);
}

const ids = async (page: Page, which: Which) => (await graphNodes(page, which)).map((n) => n.id);

/**
 * Hält das Layout an und klickt auf den Knoten `id`. Auf das natürliche Ende der Simulation zu warten
 * dauert auf langsamen CI-Runnern zu lange (ein Tick je Frame), und solange sie läuft, wandern Knoten.
 */
async function clickNode(page: Page, id: string) {
  const point = await page.evaluate((id) => {
    const { renderer } = (window as unknown as GraphWindow).app.workspace.getLeavesOfType("graph")[0].view;
    renderer.simulation.alpha = 0;
    const node = renderer.nodes.find((n) => n.id.normalize("NFC") === id)!;
    const [x, y] = renderer.toScreen(node.x, node.y);
    const rect = renderer.canvas.getBoundingClientRect();
    return { x: rect.left + x, y: rect.top + y };
  }, id);
  await page.mouse.click(point.x, point.y);
}

const NOTES = ["Projekte/Plan.md", "Projekte/Übersicht.md", "Willkommen.md"];
/** Dazu kommt Obsidians `Welcome.md` mit ihrem nicht aufgelösten Link (`hideUnresolved: false` aus graph.json). */
const ALL_NOTES = ["Projekte/Plan.md", "Projekte/Übersicht.md", "Welcome.md", "Willkommen.md", "unresolved:create a link"];

test("globaler Graph öffnet als Tab, zeigt alle Notizen und öffnet sie per Klick", async ({ vault: page }) => {
  await page.locator('.side-dock-ribbon [aria-label="Graph-Ansicht öffnen"]').click();
  await expect(page.locator(".mod-root .workspace-tab-header.is-active")).toHaveAttribute("aria-label", "Graph");
  await expect(page.locator('.mod-root .workspace-leaf-content[data-type="graph"] canvas')).toBeVisible();
  // graph.json aus Obsidian Desktop: nur Notizen, keine Tags.
  await expect.poll(() => ids(page, "global")).toEqual(ALL_NOTES);

  // Der Graph bleibt offen, die Notiz öffnet sich in einem neuen Tab.
  await clickNode(page, "Projekte/Plan.md");
  await expectOpen(page, "Projekte/Plan.md");
  await expect(page.locator('.mod-root .workspace-tab-header[aria-label="Graph"]')).toHaveCount(1);
});

test("lokaler Graph folgt der aktiven Notiz", async ({ vault: page }) => {
  await page.locator('.mod-right-split .workspace-tab-header[data-type="localgraph"]').click();
  await expect(page.locator(".local-graph-pane canvas")).toBeVisible();

  await openFromExplorer(page, "Projekte/Plan.md");
  await expect.poll(() => graphNodes(page, "local")).toEqual([
    { id: "Projekte/Plan.md", color: null, focused: true },
    { id: "Willkommen.md", color: null, focused: false },
  ]);

  await openFromExplorer(page, "Projekte/Übersicht.md");
  await expect.poll(() => graphNodes(page, "local")).toEqual([
    { id: "Projekte/Übersicht.md", color: null, focused: true },
    { id: "Willkommen.md", color: null, focused: false },
  ]);

  // Tiefe 1 aus Sicht von Willkommen: beide verlinkten Notizen.
  await openFromExplorer(page, "Willkommen.md");
  await expect.poll(() => ids(page, "local")).toEqual(NOTES);
});

test("Einstellungen aus graph.json wirken und werden beim Ändern zurückgeschrieben", async ({ page, vaultName }) => {
  const graphJson = {
    search: "path:Projekte",
    showTags: false,
    colorGroups: [{ query: "file:Plan", color: { a: 1, rgb: 0xff0000 } }],
    "collapse-filter": false,
    // Felder, die obsidian-web nicht auswertet, bleiben erhalten.
    scale: 1.25,
  };
  await page.goto("/");
  await seedVault(page, vaultName, [...readFixtureVault(), { path: ".obsidian/graph.json", content: JSON.stringify(graphJson) }]);
  await openVault(page, vaultName);
  await page.locator('.side-dock-ribbon [aria-label="Graph-Ansicht öffnen"]').click();

  // Filter und Farbgruppe aus graph.json.
  await expect.poll(() => graphNodes(page, "global")).toEqual([
    { id: "Projekte/Plan.md", color: "#ff0000", focused: false },
    { id: "Projekte/Übersicht.md", color: null, focused: false },
  ]);
  const controls = page.locator(".mod-root .graph-controls");
  await expect(controls.locator(".mod-search-setting input")).toHaveValue("path:Projekte");

  // Suche leeren und Tags einblenden: die übrigen Notizen und der Tag von Willkommen kommen dazu.
  await controls.locator(".mod-search-setting input").fill("");
  await controls.locator(".setting-item", { hasText: "Tags" }).locator(".checkbox-container").click();
  await expect.poll(() => ids(page, "global")).toEqual(["#start", ...ALL_NOTES]);

  await expect
    .poll(async () => JSON.parse((await readVaultFile(page, vaultName, ".obsidian/graph.json")) ?? "{}"))
    .toMatchObject({ search: "", showTags: true, scale: 1.25, colorGroups: graphJson.colorGroups });
});
