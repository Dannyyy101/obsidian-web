import { activeEditor, activeView, expect, openFromExplorer, openVault, readFixtureVault, readVaultFile, seedVault, test } from "./fixtures";

test("Vim-Modus aus app.json: Normalmodus, Einfügen und :w", async ({ page, vaultName }) => {
  await page.goto("/");
  await seedVault(page, vaultName, [
    ...readFixtureVault().filter((f) => f.path !== ".obsidian/app.json"),
    { path: ".obsidian/app.json", content: JSON.stringify({ vimMode: true }) },
  ]);
  await openVault(page, vaultName);
  await openFromExplorer(page, "Projekte/Plan.md");
  await activeEditor(page).click();
  await page.keyboard.press("Escape");
  await page.keyboard.type("ggdd");
  await expect(activeEditor(page).locator(".HyperMD-header-1")).toHaveCount(0);
  await page.keyboard.type("iNeu: ");
  await page.keyboard.press("Escape");
  await page.keyboard.type(":w");
  await page.keyboard.press("Enter");
  await expect(activeView(page).locator(".cm-vim-panel")).toBeVisible();
  await expect.poll(() => readVaultFile(page, vaultName, "Projekte/Plan.md")).toMatch(/^Neu: \n/);
});
