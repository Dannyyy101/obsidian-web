import { expect, expectOpen, openFromExplorer, test } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

test("Seitenleisten sind auf dem Smartphone Schubladen", async ({ vault: page }) => {
  const left = page.locator(".mod-left-split");
  const right = page.locator(".mod-right-split");
  const backdrop = page.locator(".workspace-drawer-backdrop");
  await expect(page.locator("body")).toHaveClass(/is-phone/);
  await expect(left).toBeHidden();
  await expect(right).toBeHidden();
  await expect(page.locator(".status-bar")).toBeHidden();

  // Ribbon fährt mit der linken Schublade herein, ein Tipp daneben schließt sie.
  await page.locator(".workspace-tab-header-container-left .sidebar-toggle-button").click();
  await expect(left).toBeVisible();
  await expect(page.locator(".workspace-ribbon")).toBeVisible();
  await backdrop.click({ position: { x: 380, y: 400 } });
  await expect(left).toBeHidden();
  await expect(backdrop).toBeHidden();

  // Nur eine Schublade ist offen.
  await page.locator(".workspace-tab-header-container-left .sidebar-toggle-button").click();
  await page.keyboard.press("ControlOrMeta+P");
  await page.locator(".prompt-input").fill("Backlinks anzeigen");
  await page.keyboard.press("Enter");
  await expect(right).toBeVisible();
  await expect(left).toBeHidden();
  await backdrop.click({ position: { x: 10, y: 400 } });

  // Eine Datei aus dem Explorer zu öffnen schließt die Schublade.
  await page.locator(".workspace-tab-header-container-left .sidebar-toggle-button").click();
  await openFromExplorer(page, "Willkommen.md");
  await expect(left).toBeHidden();
  await expectOpen(page, "Willkommen.md");
});

test("Auf dem Smartphone geöffnete Schubladen ändern den Desktop-Zustand nicht", async ({ vault: page }) => {
  await page.locator(".workspace-tab-header-container-left .sidebar-toggle-button").click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator("body")).not.toHaveClass(/is-phone/);
  // Auf dem Desktop ist die linke Seitenleiste standardmäßig offen und bleibt es.
  await expect(page.locator(".mod-left-split")).toBeVisible();
  await expect(page.locator(".mod-right-split")).toBeVisible();
  await page.reload();
  await expect(page.locator(".mod-left-split")).toBeVisible();
});
