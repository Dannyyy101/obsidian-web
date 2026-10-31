import { expect, expectOpen, openFromExplorer, test } from "./fixtures";

test("Schnellwechsler öffnet eine Notiz", async ({ vault: page }) => {
  await page.keyboard.press("ControlOrMeta+O");
  await page.locator(".prompt-input").fill("plan");
  await expect(page.locator(".suggestion-item").first()).toContainText("Plan");
  await page.keyboard.press("Enter");
  await expectOpen(page, "Projekte/Plan.md");
});

test("Befehlspalette führt einen Befehl aus", async ({ vault: page }) => {
  await page.keyboard.press("ControlOrMeta+P");
  await page.locator(".prompt-input").fill("Graph-Ansicht öffnen");
  await page.keyboard.press("Enter");
  await expect(page.locator(".mod-root .workspace-tab-header.is-active")).toContainText("Graph");
});

test("Suche findet Text in allen Notizen", async ({ vault: page }) => {
  await page.keyboard.press("ControlOrMeta+Shift+F");
  await page.locator(".search-view input").fill("Meilenstein");
  const result = page.locator(".search-result-file-title", { hasText: "Plan" });
  await expect(result).toBeVisible();
  await expect(page.locator(".search-result-file-title")).toHaveCount(1);
  await page.locator(".search-result-file-match").first().click();
  await expectOpen(page, "Projekte/Plan.md");
});

test("Backlinks zeigen verlinkte und nicht verlinkte Erwähnungen", async ({ vault: page }) => {
  await openFromExplorer(page, "Projekte/Plan.md");
  await page.locator('.mod-right-split .workspace-tab-header[data-type="backlink"]').click();
  const pane = page.locator(".backlink-pane");
  await expect(pane.locator(".search-result-file-title", { hasText: "Willkommen" })).toBeVisible();
  // Nicht verlinkte Erwähnungen sind wie in Obsidian zunächst eingeklappt.
  await expect(pane.locator(".search-result-file-title", { hasText: "Übersicht" })).toHaveCount(0);
  await pane.locator(".backlink-section-title", { hasText: "Nicht verlinkte Erwähnungen" }).click();
  await expect(pane.locator(".search-result-file-title", { hasText: "Übersicht" })).toBeVisible();
});

test("Tabs bleiben nach dem Neuladen erhalten", async ({ vault: page }) => {
  await openFromExplorer(page, "Willkommen.md");
  await page.keyboard.press("ControlOrMeta+Alt+KeyT");
  await openFromExplorer(page, "Projekte/Plan.md");
  const tabs = page.locator(".mod-root .workspace-tab-header");
  await expect(tabs).toHaveCount(2);

  await page.reload();
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(0)).toContainText("Willkommen");
  await expect(tabs.nth(1)).toContainText("Plan");
  await expectOpen(page, "Projekte/Plan.md");
});
