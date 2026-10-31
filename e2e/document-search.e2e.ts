import { activeEditor, activeView, expect, openFromExplorer, readVaultFile, test } from "./fixtures";

test("Strg/Cmd+F sucht in der Notiz, Ersetzen ändert alle Treffer", async ({ vault: page, vaultName }) => {
  await openFromExplorer(page, "Projekte/Plan.md");
  await activeEditor(page).click();
  await page.keyboard.press("ControlOrMeta+F");
  const search = activeView(page).locator(".document-search-input");
  await expect(search).toBeFocused();
  await search.fill("Meilenstein");
  await expect(activeView(page).locator(".document-search-count")).toHaveText("– / 1");
  await page.keyboard.press("Enter");
  await expect(activeView(page).locator(".document-search-count")).toHaveText("1 / 1");

  await activeView(page).locator('[aria-label="Ersetzen ein-/ausblenden"]').click();
  await activeView(page).locator(".document-replace-input").fill("Termin");
  await activeView(page).locator(".document-replace-button", { hasText: "Alle ersetzen" }).click();
  await page.keyboard.press("Escape");
  await expect(activeView(page).locator(".document-search-container")).toHaveCount(0);
  await expect.poll(() => readVaultFile(page, vaultName, "Projekte/Plan.md"), { timeout: 10_000 }).toContain("Der nächste Termin");
});
