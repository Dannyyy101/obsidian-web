import { activeEditor, expect, openFromExplorer, readVaultFile, test } from "./fixtures";

test("Tabellen lassen sich in der Live Preview bearbeiten und erweitern", async ({ vault: page, vaultName }) => {
  await openFromExplorer(page, "Projekte/Plan.md");
  const editor = activeEditor(page);
  await editor.click();
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.insertText("| A | B |\n| --- | --- |\n| 1 | 2 |\n\n");
  await page.keyboard.press("ControlOrMeta+End");

  const cell = (row: number, col: number) => editor.locator(`.table-cell-wrapper[data-row="${row}"][data-col="${col}"]`);
  await cell(1, 1).click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("zwei");
  // Tab in der letzten Zelle legt eine neue Zeile an.
  await page.keyboard.press("Tab");
  await expect(cell(2, 0)).toBeFocused();
  await page.keyboard.type("drei");
  await page.keyboard.press("Tab");
  await page.keyboard.type("vier");
  await page.keyboard.press("Escape");

  await cell(0, 0).click({ button: "right" });
  await page.locator(".menu-item", { hasText: "Spalte rechts einfügen" }).click();
  await expect(cell(0, 1)).toBeFocused();
  await page.keyboard.type("Neu");
  await cell(0, 0).click();

  await expect
    .poll(() => readVaultFile(page, vaultName, "Projekte/Plan.md"), { timeout: 10_000 })
    .toMatch(/^\| A \| Neu \| B \|\n\| --- \| --- \| --- \|\n\| 1 \|  \| zwei \|\n\| drei \|  \| vier \|\n/);
});
