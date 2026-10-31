import { expect, openVault, readFixtureVault, seedVault, test } from "./fixtures";

test("installiert und lädt das mitgelieferte remotely-save", async ({ page, vaultName }) => {
  await page.goto("/");
  // Ohne den Platzhalter aus dem Fixture-Vault installiert obsidian-web das Plugin beim ersten Öffnen.
  await seedVault(page, vaultName, readFixtureVault().filter((f) => !f.path.startsWith(".obsidian/plugins/")));
  await openVault(page, vaultName);

  // Das Plugin meldet sich beim ersten Start mit seinem Willkommensdialog und legt ein Ribbon-Icon an.
  await expect(page.locator(".modal", { hasText: "Remotely Save" })).toBeVisible();
  await expect(page.locator('.side-dock-ribbon [aria-label="Remotely Save"]')).toBeVisible();
});
