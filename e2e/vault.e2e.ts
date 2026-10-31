import { activeEditor, activeView, expect, expectOpen, openFromExplorer, openVault, readVaultFile, test } from "./fixtures";

test("legt über die Vault-Auswahl einen neuen Vault an", async ({ page, vaultName }) => {
  await page.goto("/");
  await page.getByPlaceholder("Vault-Name").fill(vaultName);
  await page.getByRole("button", { name: "Anlegen" }).click();
  await expect(page).toHaveURL(new RegExp(`vault=${vaultName}`));
  await expect(page.locator(".mod-root .empty-state-title")).toHaveText("Keine Datei geöffnet");

  await page.goto("/");
  await expect(page.locator(".vault-list-item", { hasText: vaultName })).toBeVisible();
});

test("zeigt die Dateien des Vaults im Explorer", async ({ vault: page }) => {
  await expect(page.locator('.nav-file-title[data-path="Willkommen.md"]')).toBeVisible();
  await page.locator('.nav-folder-title[data-path="Projekte"]').click();
  await expect(page.locator('.nav-file-title[data-path="Projekte/Plan.md"]')).toBeVisible();
  await expect(page.locator('.nav-file-title[data-path="Projekte/Übersicht.md"]')).toHaveText("Übersicht");
});

test("speichert Änderungen ins OPFS und lädt sie nach dem Neuladen wieder", async ({ vault: page, vaultName }) => {
  await openFromExplorer(page, "Projekte/Plan.md");
  const editor = activeEditor(page);
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\nNeue Zeile aus dem Test.");

  await expect.poll(() => readVaultFile(page, vaultName, "Projekte/Plan.md"), { timeout: 10_000 }).toContain("Neue Zeile aus dem Test.");

  await openVault(page, vaultName);
  // Der zuletzt offene Tab wird wiederhergestellt.
  await expectOpen(page, "Projekte/Plan.md");
  await expect(activeEditor(page)).toContainText("Neue Zeile aus dem Test.");
});

test("legt eine neue Notiz an und benennt sie über den Inline-Titel um", async ({ vault: page, vaultName }) => {
  await page.keyboard.press("ControlOrMeta+Alt+KeyN");
  await expectOpen(page, "Unbenannt.md");
  await expect(page.locator('.nav-file-title[data-path="Unbenannt.md"]')).toBeVisible();
  const title = activeView(page).locator(".cm-content .inline-title");

  await title.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Idee");
  await page.keyboard.press("Enter");
  await expect(page.locator('.nav-file-title[data-path="Idee.md"]')).toBeVisible();
  await expect(page.locator('.nav-file-title[data-path="Unbenannt.md"]')).toHaveCount(0);
  await expect.poll(() => readVaultFile(page, vaultName, "Idee.md")).toBe("");
});

test("passt Links beim Umbenennen an", async ({ vault: page, vaultName }) => {
  await openFromExplorer(page, "Projekte/Plan.md");
  const title = activeView(page).locator(".cm-content .inline-title");
  await title.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Fahrplan");
  await page.keyboard.press("Enter");

  await expect(page.locator('.nav-file-title[data-path="Projekte/Fahrplan.md"]')).toBeVisible();
  await expect.poll(() => readVaultFile(page, vaultName, "Willkommen.md")).toContain("[[Fahrplan]]");
});
